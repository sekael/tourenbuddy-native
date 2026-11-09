// React Native reuses the native view of an unmounted TextInput for the next one (Fabric's recycle
// pool). A text field iOS filled (a strong password, AutoFill) keeps UIKit's yellow, locked state,
// so the TextInput that gets it next takes no input until the app restarts:
// https://github.com/react/react-native/issues/53050. React Native asks a component view class for
// `+shouldBeRecycled` when it registers it; this adds the answer NO before that, at load time.
// The class is looked up at runtime, so this pod needs no React Native headers.
// Remove once React Native resets that state itself.

#import <Foundation/Foundation.h>
#import <objc/runtime.h>

@interface TBTextInputNoRecycle : NSObject
@end

@implementation TBTextInputNoRecycle

+ (void)load
{
  Class textInput = NSClassFromString(@"RCTTextInputComponentView");
  if (textInput == nil) {
    NSLog(@"TextInputNoRecycle: RCTTextInputComponentView not found, text fields stay recycled");
    return;
  }
  IMP never = imp_implementationWithBlock(^BOOL(id cls) {
    return NO;
  });
  NSString *types = [NSString stringWithFormat:@"%s@:", @encode(BOOL)];
  class_addMethod(object_getClass(textInput), NSSelectorFromString(@"shouldBeRecycled"), never,
                  types.UTF8String);
}

@end
