import { Alert } from 'react-native';

/**
 * react-native-web's `Alert.alert` does nothing, so every confirmation would silently vanish: the
 * browser's dialogs stand in, installed when this module loads (the root layout imports it). Each
 * choice other than Cancel is offered in turn, safe ones before destructive ones, until one is
 * confirmed; none confirmed is Cancel.
 */
Alert.alert = (title, message, buttons = []) => {
  const text = [title, message].filter(Boolean).join('\n\n');
  const choices = buttons
    .filter((button) => button.style !== 'cancel')
    .sort((a, b) => Number(a.style === 'destructive') - Number(b.style === 'destructive'));
  if (buttons.length <= 1) {
    window.alert(text);
    buttons[0]?.onPress?.();
    return;
  }
  for (const choice of choices) {
    if (window.confirm(choices.length > 1 ? `${text}\n\n${choice.text}?` : text)) {
      choice.onPress?.();
      return;
    }
  }
  buttons.find((button) => button.style === 'cancel')?.onPress?.();
};

/** A system alert with one OK button. */
export function showAlert(title: string, message: string) {
  Alert.alert(title, message);
}
