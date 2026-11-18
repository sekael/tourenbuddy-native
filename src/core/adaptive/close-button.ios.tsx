import { Button, Host } from '@expo/ui/swift-ui';
import { accessibilityLabel, buttonStyle, labelStyle } from '@expo/ui/swift-ui/modifiers';

import type { CloseButtonProps } from './close-button';

/** The system close button (iOS): an xmark in Liquid Glass. */
export function CloseButton({ label, onPress }: CloseButtonProps) {
  return (
    <Host matchContents>
      {/* The xmark, as every other sheet's close: on its own, iOS 26 writes "Close" in the
          device's language («Schließen» in an app switched to English). */}
      <Button
        role="close"
        label={label}
        systemImage="xmark"
        onPress={onPress}
        modifiers={[buttonStyle('glass'), labelStyle('iconOnly'), accessibilityLabel(label)]}
      />
    </Host>
  );
}
