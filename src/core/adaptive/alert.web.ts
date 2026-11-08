/** The browser's alert: react-native-web has no `Alert`. */
export function showAlert(title: string, message: string) {
  window.alert(`${title}\n\n${message}`);
}
