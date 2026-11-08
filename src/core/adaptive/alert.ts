import { Alert } from 'react-native';

/** A system alert with one OK button. */
export function showAlert(title: string, message: string) {
  Alert.alert(title, message);
}
