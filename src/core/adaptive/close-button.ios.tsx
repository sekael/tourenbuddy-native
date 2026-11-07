import { Button, Host } from '@expo/ui/swift-ui';
import { accessibilityLabel, buttonStyle } from '@expo/ui/swift-ui/modifiers';

import type { CloseButtonProps } from './close-button';

/** The system close button (iOS): an xmark in Liquid Glass. */
export function CloseButton({ label, onPress }: CloseButtonProps) {
  return (
    <Host matchContents>
      <Button
        role="close"
        onPress={onPress}
        modifiers={[buttonStyle('glass'), accessibilityLabel(label)]}
      />
    </Host>
  );
}
