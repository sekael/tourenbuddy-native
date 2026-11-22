import { useState, type ComponentRef, type Ref } from 'react';
import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { color, fieldType, radius, size, space } from '@/core/theme/tokens';

export type TextFieldProps = Omit<TextInputProps, 'aria-label' | 'accessibilityLabel'> & {
  /** The field's accessible name; the placeholder is not one. */
  label: string;
  /** To move the focus here, as the return key of the field before does. */
  ref?: Ref<TextFieldHandle>;
};

export type TextFieldHandle = ComponentRef<typeof TextInput>;

/**
 * The system text field (`UITextField` on iOS, `EditText` on Android) on an opaque fill, so its
 * contrast never depends on what is behind it. Pass content types for autofill.
 */
export function TextField({ label, style, onFocus, onBlur, ...props }: TextFieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <TextInput
      aria-label={label}
      placeholderTextColor={color.onSurfaceVariant}
      selectionColor={color.primary}
      {...props}
      // A field never stands empty and unnamed: without a placeholder its name stands in.
      placeholder={props.placeholder ?? label}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      style={[styles.field, focused && styles.focused, style]}
    />
  );
}

const styles = StyleSheet.create({
  field: {
    ...fieldType.body,
    color: color.onSurface,
    backgroundColor: color.surface,
    borderWidth: size.fieldBorder,
    borderColor: color.outlineVariant,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: size.touch,
  },
  focused: { borderColor: color.primary, backgroundColor: color.background },
});
