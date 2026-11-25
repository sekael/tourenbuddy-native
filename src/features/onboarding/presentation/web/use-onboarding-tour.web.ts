import { driver, type Driver, type Popover } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useRef, useState } from 'react';

import i18n from '@/core/i18n';
import { createLogger } from '@/core/logging/logger';
import { useReactive } from '@/core/web/use-reactive.web';

import type { OnboardingStep, TourSurface } from './onboarding-steps.web';
import './onboarding-tour.css';

/** Thrown out of `ctx.spotlight` when the tour ended while staging. */
class TourEnded extends Error {}

/** Capabilities handed to `stage` so it can choreograph the navigation. */
export type StageContext = {
  /**
   * Spotlight an intermediate control on the way to the step's target (wait until it exists and
   * stops moving, glide onto it with an optional one-line hint, hold a beat). Rejects once the
   * tour has ended, so `stage` stops before opening anything else.
   */
  spotlight: (selector: string, hintKey?: string) => Promise<void>;
};

export type UseOnboardingTourOptions = {
  /** The steps, in order: the map tour's or the calendar tour's. */
  steps: OnboardingStep[];
  /** Make a step's surface visible; `from` is the surface on screen (null at start). */
  stage: (
    surface: TourSurface,
    ctx: StageContext,
    from: TourSurface | null,
  ) => void | Promise<void>;
  /** Close whatever the tour opened once it ends. */
  cleanup: () => void;
  /** Only when run to completion, after teardown. */
  onCompleted?: () => void;
  /** Only on an early "Finish tour", after teardown. */
  onDismissed?: () => void;
  saveTourStep: (n: number) => void | Promise<void>;
  dismissTourAtSignIn: () => void | Promise<void>;
  canAutoStart: () => boolean;
  getResumeStep: () => number;
  pace?: Partial<TourPace>;
};

/** Pacing of the staged transitions. */
export type TourPace = {
  /** How long a waypoint spotlight (and its hint) is held so the user can register it. */
  holdMs: number;
  /** Spotlight glide between two targets. driver.js tweens over a fixed 400 ms. */
  glideMs: number;
  /** Popover / overlay fade-out before the spotlight moves on or the tour ends. */
  fadeMs: number;
};

const DEFAULT_PACE: TourPace = { holdMs: 1100, glideMs: 420, fadeMs: 200 };

// driver.js keeps ONE module-level state, shared by every driver instance. A
// tour's fade-out destroys its driver a beat after teardown; if another tour
// (the calendar tour after the map hand-off, a quick replay) starts within that
// window, the late destroy would wipe the new tour's state. Module-level so any
// instance can flush it before creating its own driver.
let pendingDestroy: (() => void) | null = null;
function flushPendingDestroy() {
  pendingDestroy?.();
}

/**
 * A fixed, invisible box the spotlight can rest on while the app navigates
 * between surfaces. Highlighting a real element that then unmounts (a closing
 * sheet, a collapsing menu) leaves driver.js measuring a detached node — the
 * cutout snaps to the top-left corner on the next scroll/resize refresh.
 */
let anchorEl: HTMLElement | null = null;
function anchorAt(x: number, y: number, width: number, height: number): HTMLElement {
  if (!anchorEl || !anchorEl.isConnected) {
    anchorEl = document.createElement('div');
    anchorEl.className = 'onboarding-tour-anchor';
    anchorEl.setAttribute('aria-hidden', 'true');
    Object.assign(anchorEl.style, {
      position: 'fixed',
      pointerEvents: 'none',
      visibility: 'hidden',
    });
    document.body.appendChild(anchorEl);
  }
  Object.assign(anchorEl.style, {
    left: `${x}px`,
    top: `${y}px`,
    width: `${width}px`,
    height: `${height}px`,
  });
  return anchorEl;
}

type TourState = {
  isRunning: boolean;
  showWelcome: boolean;
  currentIndex: number;
  isStaging: boolean;
};

/** The tour's controller, created once per host; `opts` reads the host's latest options. */
function createTour(state: TourState, opts: () => UseOnboardingTourOptions) {
  const t = (key: string) => i18n.t(key as never, { ns: 'web' }) as string;
  const logger = createLogger('OnboardingTour');

  const steps = opts().steps;
  const LAST_INDEX = steps.length - 1;

  // isRunning / showWelcome / currentIndex / isStaging live on `state` (re-renders the host).
  // One driver for the whole run: re-highlighting a live driver glides the
  // cutout from target to target instead of dropping the mask and raising a new
  // one (the old off → pause → on cycle that made every step feel choppy).
  let driverObj: Driver | null = null;
  // The surface currently on screen; steps sharing it skip staging entirely.
  let stagedSurface: TourSurface | null = null;
  // Rect the spotlight last settled on — where a parked cutout collapses to.
  let lastRect: DOMRect | null = null;
  // Bumped per highlight so a late `refreshAfterMotion` from an older one bails.
  let highlightSeq = 0;

  const reducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pace: TourPace = {
    ...DEFAULT_PACE,
    ...(reducedMotion ? { glideMs: 0, fadeMs: 0 } : {}),
    ...opts().pace,
  };
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const clamp = (i: number) => Math.max(0, Math.min(i, LAST_INDEX));

  /**
   * Resolve the first *visible* element matching `selector`, or the first match
   * if none is visible. Responsive components render both layouts and hide one
   * with `display:none` (e.g. calendar-nav's desktop sidebar + mobile bottom
   * bar share `data-tour="nav-seasons"`); a plain `querySelector` would return
   * the hidden DOM-first one, anchoring the spotlight to a zero rect. A
   * `display:none` element has no client rects, so filter on that.
   */
  function findVisible(selector: string): Element | null {
    const els = [...document.querySelectorAll(selector)];
    return els.find((el) => el.getClientRects().length > 0) ?? els[0] ?? null;
  }

  /**
   * Resolve the first visible element matching `selector`, or null if it never
   * appears within `timeoutMs`. A staged overlay animates in (Transition
   * mode="out-in"), so the target is often not in the DOM the instant we stage it.
   */
  function waitForElement(selector: string, timeoutMs = 1000): Promise<Element | null> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const existing = findVisible(selector);
        if (existing) return resolve(existing);

        let timer: ReturnType<typeof setTimeout>;

        const observer = new MutationObserver(() => {
          const el = findVisible(selector);
          if (el) {
            observer.disconnect();
            clearTimeout(timer);
            resolve(el);
          }
        });

        observer.observe(document.body, { childList: true, subtree: true });

        timer = setTimeout(() => {
          observer.disconnect();
          resolve(null);
        }, timeoutMs);
      }, 0);
    });
  }

  /**
   * Keep the popover clear of the fixed tour banner.
   *
   * driver.js places the popover against the target rect and the VIEWPORT only —
   * it knows nothing about our banner, which is pinned to the top on the same
   * layer. A `side: 'top'` step (or a `bottom` one driver flips up because the
   * target sits low, e.g. the notification toggles in the mobile profile sheet)
   * lands the popover under the banner, hiding its title and first lines.
   * The popover is `position: fixed`, so nudging its `top` is enough.
   */
  function clampPopoverBelowBanner() {
    // HTMLElement, not Element: only the former carries `.style`.
    const popover = document.querySelector<HTMLElement>('.driver-popover');
    const banner = document.querySelector<HTMLElement>('.tour-banner');
    if (!popover || !banner) return;
    // Layout boxes (offset*), not getBoundingClientRect: both the popover and
    // the banner may still be mid entrance animation (translate + scale), which
    // skews the visual rect. Both are `position: fixed`, so the offsets are
    // viewport coordinates.
    const minTop = banner.offsetTop + banner.offsetHeight + 8;
    // Only nudge on a real overlap. An unconditional write re-places every
    // popover driver already positioned correctly — the same needless
    // reposition `refreshAfterMotion` guards against.
    if (popover.offsetTop < minTop) popover.style.top = `${minTop}px`;
    // driver.js clamps to the viewport with no margin, leaving edge-anchored
    // popovers flush against the screen edge. Keep the same 12px gutter the
    // sheets use on both sides. `right` is reset so the pair can't stretch the box.
    // Two passes: the popover is shrink-to-fit, so moving it left gives it room
    // to widen — re-measure once so the wider box still keeps the gutter.
    const gutter = 12;
    for (let pass = 0; pass < 2; pass++) {
      const x = popover.offsetLeft;
      const clamped = Math.max(
        gutter,
        Math.min(x, window.innerWidth - gutter - popover.offsetWidth),
      );
      if (clamped === x) break;
      popover.style.left = `${clamped}px`;
      popover.style.right = 'auto';
    }
  }

  /**
   * Bumped on every start and teardown. A staging run belongs to one token; when
   * the token moves on, the run is dead — even if a new tour is already running.
   */
  let runToken = 0;

  /**
   * Drop the driver. Animated: the overlay + popover fade out (CSS keyed on the
   * body class) and the driver is destroyed once they're gone, so the tour
   * dissolves instead of vanishing in one frame.
   */
  function releaseDriver() {
    const obj = driverObj;
    driverObj = null;
    stagedSurface = null;
    lastRect = null;
    if (!obj) return;
    flushPendingDestroy();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const destroy = () => {
      clearTimeout(timer);
      pendingDestroy = null;
      document.body.classList.remove('onboarding-tour-leaving');
      obj.destroy();
      anchorEl?.remove();
    };
    document.body.classList.add('onboarding-tour-leaving');
    pendingDestroy = destroy;
    timer = setTimeout(destroy, pace.fadeMs);
  }

  function teardown() {
    runToken++;
    // Capture before resetting: cleanup restores host UI and MAY navigate (the
    // calendar cleanup returns to the planned view). teardown fires on every host
    // route-leave/unmount via stop(), so running cleanup unconditionally hijacks
    // unrelated navigations — e.g. tapping a tour in the seasons view pushes to
    // the map, then this cleanup's setView('planned') replace clobbers it (the
    // race the mobile route transition loses). Only clean up if a tour/welcome
    // was actually up.
    const wasActive = state.isRunning || state.showWelcome;
    releaseDriver();
    state.isRunning = false;
    state.isStaging = false;
    state.showWelcome = false;
    if (wasActive) opts().cleanup();
  }

  /** Dismiss via the "Finish tour" button: persist the current step. */
  function finishDismiss() {
    opts().saveTourStep(state.currentIndex);
    teardown();
    opts().onDismissed?.();
  }

  /**
   * Hard-stop on navigation / unmount. driver.js appends its overlay directly to
   * <body> (outside Vue), so if the host page unmounts without this the overlay
   * orphans onto the next route. Persist the resume step, drop the welcome, and
   * tear the driver overlay down. Idempotent — safe to call when nothing runs.
   */
  function stop() {
    if (state.isRunning) opts().saveTourStep(state.currentIndex);
    teardown();
  }

  /** Advanced past the final step: reset resume point so a reopen replays. */
  function finishCompleted() {
    opts().saveTourStep(0);
    teardown();
    opts().onCompleted?.();
  }

  /** Next button / backdrop tap. */
  function advance() {
    if (state.isStaging) return;
    if (state.currentIndex >= LAST_INDEX) {
      finishCompleted();
      return;
    }
    void goToStep(state.currentIndex + 1, 1);
  }

  function back() {
    if (state.isStaging || state.currentIndex <= 0) return;
    void goToStep(state.currentIndex - 1, -1);
  }

  function buildPopover(index: number): Popover {
    const step = steps[index];
    // No footer buttons: all navigation (back / next / finish + progress) lives
    // in the top banner (`onboarding-tour-banner.vue`), driven via the exposed
    // `back` / `next` / `finish` actions. Tap-away still advances (overlay
    // click behavior). The popover is title + description only.
    return {
      title: t(step.titleKey),
      description: t(step.bodyKey),
      showButtons: [],
      // Render below the target by default: the control banner is pinned to the
      // top, so a popover placed below its anchor never collides with it. A step
      // can override `side`/`align` when its target sits low in a tall surface
      // and `bottom` would overflow the screen (driver.js would then flip it up
      // into the banner). See `OnboardingStep.side`.
      side: step.side ?? 'bottom',
      align: step.align ?? 'center',
    };
  }

  function ensureDriver(): Driver {
    if (driverObj) return driverObj;
    flushPendingDestroy();
    // driver.js stays at the PWA's 1.4.0: 1.14 draws its overlay in the browser's top layer, above
    // the tour banner, so a tap on "Finish tour" hits the overlay and advances instead (O-2).
    driverObj = driver({
      animate: !reducedMotion,
      allowClose: false, // no Esc / backdrop-close; "Finish tour" is the only dismiss
      overlayClickBehavior: () => advance(), // backdrop tap advances
      disableActiveInteraction: true, // highlighted control is inert
      overlayColor: 'rgb(8, 15, 32)', // deep slate rather than flat black
      overlayOpacity: 0.62,
      stageRadius: 18, // softer spotlight cutout corners (default 5)
      // Tighter than driver's default 10: an edge-flush target (the mobile
      // bottom-nav tabs) otherwise pushes the cutout past the viewport edge.
      stagePadding: 6,
      popoverOffset: 14,
      popoverClass: 'onboarding-tour-popover',
    });
    return driverObj;
  }

  /**
   * Fade the visible popover out before the spotlight moves. driver.js hides it
   * with `display:none` the instant a new highlight starts — a hard cut.
   */
  async function fadeOutPopover() {
    const popover = document.querySelector<HTMLElement>('.driver-popover');
    if (!popover || popover.style.display === 'none' || popover.classList.contains('is-leaving'))
      return;
    popover.classList.add('is-leaving');
    await sleep(pace.fadeMs);
  }

  /**
   * Rest the spotlight on the invisible anchor: either frozen exactly where it
   * is (`shrink = false`, before the highlighted control unmounts) or collapsed
   * to a point at its centre (`shrink = true`, while the app swaps surfaces).
   * The next highlight then glides out of that spot to its new target.
   */
  function park(shrink: boolean) {
    if (!driverObj || !lastRect) return;
    const r = lastRect;
    const anchor = shrink
      ? anchorAt(r.x + r.width / 2, r.y + r.height / 2, 0, 0)
      : anchorAt(r.x, r.y, r.width, r.height);
    highlightSeq++;
    driverObj.highlight({ element: anchor });
  }

  /**
   * Re-anchor stage + popover once any residual motion stops. driver.js
   * positions the popover ONCE at highlight time — so a sheet-transition tail
   * or a scroll that finishes after the popover is attached leaves it pinned
   * to a stale rect. Fire-and-forget; bails when a newer highlight took over.
   */
  async function refreshAfterMotion(el: Element, seq: number) {
    const obj = driverObj;
    // Snapshot where the popover was anchored, so we only re-position if the
    // target actually drifted. A blind refresh re-runs driver's placement even
    // when nothing moved — that needless reposition is a visible "jump".
    const before = el.getBoundingClientRect();
    const stale = () => seq !== highlightSeq || driverObj !== obj || !state.isRunning;
    // Give late motion a chance to start…
    await sleep(pace.glideMs);
    if (stale()) return;
    // …then wait for it to stop and recompute with fresh rects.
    await waitForPosition(el, 1500);
    if (stale()) return;
    const after = el.getBoundingClientRect();
    const moved =
      Math.abs(after.top - before.top) > 1 ||
      Math.abs(after.left - before.left) > 1 ||
      Math.abs(after.width - before.width) > 1 ||
      Math.abs(after.height - before.height) > 1;
    if (moved) {
      lastRect = after;
      obj!.refresh();
      clampPopoverBelowBanner(); // refresh re-places the popover from scratch
    }
  }

  /**
   * Wait until `el`'s bounding rect is stable for several consecutive frames
   * (~80 ms of stillness). Sheets and menus animate in — attaching a popover
   * mid-animation pins it at a stale position, since driver.js positions it
   * exactly once. The window must be generous enough to also catch motion that
   * hasn't started yet (transition delays).
   */
  async function waitForPosition(el: Element, timeoutMs = 1200): Promise<void> {
    const frame = () => new Promise((resolve) => setTimeout(resolve, 16));
    const deadline = Date.now() + timeoutMs;
    let last = el.getBoundingClientRect();
    let stableFrames = 0;
    while (Date.now() < deadline) {
      await frame();
      const rect = el.getBoundingClientRect();
      const same =
        rect.top === last.top &&
        rect.left === last.left &&
        rect.width === last.width &&
        rect.height === last.height;
      stableFrames = same ? stableFrames + 1 : 0;
      if (stableFrames >= 5) return;
      last = rect;
    }
  }

  /**
   * Glide the spotlight onto `el`, then — once the glide is done and the target
   * stopped moving — attach `popover` against the final rect. Two phases because
   * driver.js places a popover passed with a gliding highlight at the glide's
   * MIDPOINT (against an in-between rect) and never moves it again. Returns
   * false if a newer highlight or a teardown took over meanwhile.
   */
  async function moveTo(el: Element, popover?: Popover): Promise<boolean> {
    await fadeOutPopover();
    if (!state.isRunning) return false;
    const obj = ensureDriver();
    const seq = ++highlightSeq;
    obj.highlight({ element: el });
    await Promise.all([sleep(pace.glideMs), waitForPosition(el)]);
    if (seq !== highlightSeq || driverObj !== obj || !state.isRunning) return false;
    lastRect = el.getBoundingClientRect();
    if (popover) {
      // Same element → no glide: driver renders the popover immediately (and
      // snaps the cutout to the settled rect, a no-op unless it drifted).
      obj.highlight({ element: el, popover });
      clampPopoverBelowBanner();
      void refreshAfterMotion(el, seq);
    }
    return true;
  }

  /**
   * Spotlight an intermediate navigation control: control exists + stopped
   * moving → glide onto it (+ hint) → hold → hint fades and the cutout freezes
   * in place on the anchor, because the caller's next move actuates the
   * control — which typically unmounts it (menu item → sheet). Handed to
   * `stage` via the context. No-op if the element never appears.
   */
  async function spotlight(selector: string, hintKey?: string) {
    if (!state.isRunning) return;
    const el = await waitForElement(selector, 700);
    if (!el || !state.isRunning) return;
    await waitForPosition(el);
    // A hinted waypoint shows a short, description-only popover ("Open menu")
    // naming the control; without a hint it stays a bare spotlight. No forced
    // side — driver.js auto-places it to fit, since waypoints sit anywhere
    // (bottom-right FAB, mid-list menu item, action-bar tab).
    const moved = await moveTo(
      el,
      hintKey
        ? {
            description: t(hintKey),
            showButtons: [],
            popoverClass: 'onboarding-tour-popover onboarding-hint-popover',
          }
        : undefined,
    );
    if (!moved) return;
    await sleep(pace.holdMs);
    if (!state.isRunning) return;
    await fadeOutPopover();
    park(false);
  }

  /**
   * Move to `index`. The cycle:
   *   1. popover fades out,
   *   2. if the surface changes: the cutout collapses while `stage` drives the
   *      navigation, gliding over each waypoint (FAB → menu item → …),
   *   3. the target is scrolled into view and settles, the spotlight glides
   *      onto it, then its message fades in.
   * Steps on the surface already on screen skip 2 and simply glide.
   * `direction` (+1 / -1) decides which way to skip a target that never shows.
   */
  async function goToStep(index: number, direction: 1 | -1, token = runToken) {
    const alive = () => token === runToken && state.isRunning;
    if (!alive()) return;
    state.isStaging = true;
    // Waypoints throw once this run is over, so `stage` stops navigating instead
    // of opening its next overlay after the tour was finished mid-staging.
    const ctx: StageContext = {
      spotlight: async (selector, hintKey) => {
        if (alive()) await spotlight(selector, hintKey);
        if (!alive()) throw new TourEnded();
      },
    };
    try {
      const clamped = clamp(index);
      state.currentIndex = clamped;
      const step: OnboardingStep = steps[clamped];

      await fadeOutPopover();
      if (!alive()) return;

      if (step.surface !== stagedSurface) {
        park(true);
        const from = stagedSurface;
        // Unknown until stage completes: a stage cut short leaves a half-open UI.
        stagedSurface = null;
        await opts().stage(step.surface, ctx, from);
        stagedSurface = step.surface;
      }
      const el = await waitForElement(step.target);

      // Tour may have been finished during the awaited navigation.
      if (!alive()) return;

      if (!el) {
        logger.warn(`Onboarding target missing, skipping step ${clamped}: ${step.target}`);
        const next = clamped + direction;
        if (next < 0 || next > LAST_INDEX) {
          finishDismiss();
          return;
        }
        await goToStep(next, direction, token);
        return;
      }

      // Scroll the whole target into view first: driver.js only auto-scrolls
      // fully off-screen elements, so a tall section would peek just its header.
      // Smooth (the cutout is parked or resting on a neighbour meanwhile); the
      // short pause lets the scroll start before the stability check, which
      // otherwise could pass before it begins.
      el.scrollIntoView({
        behavior: reducedMotion ? 'instant' : 'smooth',
        block: step.scrollBlock ?? 'start',
        inline: step.scrollInline ?? 'nearest',
      });
      await sleep(reducedMotion ? 0 : 60);
      await waitForPosition(el);
      if (!alive()) return;

      await moveTo(el, buildPopover(clamped));
    } catch (error) {
      if (!(error instanceof TourEnded)) throw error;
    } finally {
      if (token === runToken) state.isStaging = false;
    }
  }

  /** Start (or resume) the tour at `fromStep`. Bypasses the auto-start gate. */
  function startTour(fromStep: number) {
    if (state.isRunning) return;
    state.isRunning = true;
    runToken++;
    void goToStep(clamp(fromStep), 1);
  }

  /**
   * Auto-start once at sign-in: only when the gate allows it and not already
   * running. Opens the welcome screen rather than starting straight away (the
   * unprompted tour start was the bad UX). The gate is left untouched and the
   * tour stays down — both are decided by the welcome actions below.
   */
  function maybeStartTour() {
    if (state.isRunning || state.showWelcome || !opts().canAutoStart()) return;
    state.showWelcome = true;
  }

  /** Welcome "Start tour": engage the tour and stop it auto-popping again. */
  function startFromWelcome() {
    state.showWelcome = false;
    opts().dismissTourAtSignIn();
    startTour(opts().getResumeStep());
  }

  /** Welcome "Skip for now": dismiss the welcome but let it return next sign-in. */
  function skipWelcome() {
    state.showWelcome = false;
  }

  /** Welcome "Don't show again": dismiss and flip the gate off for good. */
  function dismissWelcome() {
    state.showWelcome = false;
    opts().dismissTourAtSignIn();
  }

  return {
    totalSteps: steps.length,
    startTour,
    maybeStartTour,
    stop,
    startFromWelcome,
    skipWelcome,
    dismissWelcome,
    next: advance,
    back,
    finish: finishDismiss,
  };
}

/**
 * The PWA's guided tour (`use-onboarding-tour.ts` there): driver.js spotlights, one driver per
 * run gliding from target to target, staged navigation between surfaces, a welcome before an
 * automatic start, the resume step persisted.
 */
export function useOnboardingTour(options: UseOnboardingTourOptions) {
  'use no memo';
  const state = useReactive<TourState>(() => ({
    isRunning: false,
    showWelcome: false,
    currentIndex: 0,
    isStaging: false,
  }));
  const latest = useRef(options);
  latest.current = options;
  const [tour] = useState(() => createTour(state, () => latest.current));
  return {
    ...tour,
    isRunning: state.isRunning,
    isStaging: state.isStaging,
    showWelcome: state.showWelcome,
    currentIndex: state.currentIndex,
    currentTitle: i18n.t(options.steps[state.currentIndex]!.labelKey as never, {
      ns: 'web',
    }) as string,
    /** Synchronous reads, for decisions inside handlers. */
    isRunningNow: () => state.isRunning,
    showWelcomeNow: () => state.showWelcome,
  };
}
