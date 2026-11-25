// Safari draws the focus ring for any focus() made by script while nothing was focused (on iPhone,
// every time). Menus hand focus to their content only when the user is on the keyboard.
let keyboard = false;
window.addEventListener('keydown', () => (keyboard = true), true);
window.addEventListener('pointerdown', () => (keyboard = false), true);

export function focusForKeyboard(el: HTMLElement | null | undefined): void {
  if (keyboard) el?.focus();
}
