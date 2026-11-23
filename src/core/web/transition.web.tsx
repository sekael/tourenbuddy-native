import {
  cloneElement,
  isValidElement,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type Ref,
} from 'react';

type Phase = 'enter' | 'leave';

type Child = ReactElement<any> | null | false | undefined;

/** The longest transition or animation on the element, in ms, as Vue reads it. */
function duration(el: HTMLElement) {
  const style = getComputedStyle(el);
  const longest = (durations: string, delays: string) => {
    const list = (s: string) =>
      s.split(',').map((v) => parseFloat(v) * (v.includes('ms') ? 1 : 1000) || 0);
    const d = list(durations);
    const l = list(delays);
    return Math.max(0, ...d.map((v, i) => v + (l[i % l.length] ?? 0)));
  };
  return Math.max(
    longest(style.transitionDuration, style.transitionDelay),
    longest(style.animationDuration, style.animationDelay),
  );
}

/**
 * Runs one Vue transition phase on `el`: `-from` and `-active` first, the next frame `-to` instead of
 * `-from`, and once the longest transition ends, both cleared and `done` called.
 */
function run(
  el: HTMLElement,
  name: string,
  phase: Phase,
  cls: (n: string) => string,
  done: () => void,
) {
  const names = (suffix: string) => cls(`${name}-${phase}-${suffix}`).split(' ').filter(Boolean);
  const from = names('from');
  const active = names('active');
  const to = names('to');
  el.classList.add(...from, ...active);
  let frame = requestAnimationFrame(() => {
    frame = requestAnimationFrame(() => {
      el.classList.remove(...from);
      el.classList.add(...to);
      timer = setTimeout(finish, duration(el) + 1);
    });
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const finish = () => {
    el.classList.remove(...active, ...to);
    done();
  };
  return () => {
    cancelAnimationFrame(frame);
    clearTimeout(timer);
    el.classList.remove(...from, ...active, ...to);
  };
}

const keyOf = (child: Child) => (isValidElement(child) ? (child.key ?? '') : null);

/**
 * Vue's `<Transition>` for the ported web components (D2): the child enters and leaves with the
 * `<name>-enter-*` / `<name>-leave-*` classes of the caller's CSS Module, so the PWA's transition CSS
 * applies unchanged. A changed key swaps children, the old one leaving first (`mode="out-in"`). The
 * child must pass `ref` to its root element.
 */
export function Transition({
  name,
  cls = (n) => n,
  appear = false,
  children,
  onAfterEnter,
  onAfterLeave,
}: {
  name: string;
  cls?: (name: string) => string;
  appear?: boolean;
  children?: Child;
  onAfterEnter?: () => void;
  onAfterLeave?: () => void;
}) {
  'use no memo';
  const [shown, setShown] = useState<Child>(children);
  const [phase, setPhase] = useState<Phase | null>(appear && children ? 'enter' : null);
  const el = useRef<HTMLElement | null>(null);
  const afterEnter = useEffectEvent(() => onAfterEnter?.());
  const afterLeave = useEffectEvent(() => onAfterLeave?.());

  const nextKey = keyOf(children);
  const shownKey = keyOf(shown);
  const leaving = phase === 'leave';

  // Same child (or same key): follow its props; a new or removed one starts a phase.
  if (nextKey === shownKey && nextKey !== null && leaving) {
    // Shown again while leaving: it comes back from where it is, as Vue cancels the leave.
    setShown(children);
    setPhase('enter');
  } else if (nextKey === shownKey && nextKey !== null && shown !== children) setShown(children);
  else if (nextKey !== shownKey && !leaving) {
    if (shownKey === null) {
      setShown(children);
      setPhase('enter');
    } else setPhase('leave');
  }

  useLayoutEffect(() => {
    const node = el.current;
    if (!phase || !node) return;
    return run(node, name, phase, cls, () => {
      if (phase === 'enter') {
        setPhase(null);
        afterEnter();
        return;
      }
      setShown(null);
      setPhase(null);
      afterLeave();
    });
    // The phase starts once per change of phase or child; `cls` and `name` are fixed per use.
  }, [phase, shownKey]);

  // After a leave, the waiting child (out-in) enters.
  useLayoutEffect(() => {
    if (phase === null && shownKey === null && nextKey !== null) {
      setShown(children);
      setPhase('enter');
    }
  }, [phase, shownKey, nextKey, children]);

  if (!isValidElement<{ ref?: Ref<HTMLElement> }>(shown)) return null;
  const own = shown.props.ref;
  return cloneElement<{ ref?: Ref<HTMLElement> }>(shown, {
    ref: (node: HTMLElement | null) => {
      el.current = node;
      if (typeof own === 'function') own(node);
      else if (own) (own as { current: HTMLElement | null }).current = node;
    },
  });
}
