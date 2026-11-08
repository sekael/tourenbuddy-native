Pod::Spec.new do |s|
  s.name             = 'TextInputNoRecycle'
  s.version          = '1.0.0'
  s.summary          = 'Keeps React Native from reusing native text fields (react/react-native#53050).'
  s.homepage         = 'https://github.com/sekael/tourenbuddy-native'
  s.license          = 'UNLICENSED'
  s.author           = 'TourenBuddy'
  s.platforms        = { :ios => '26.0' }
  s.source           = { git: 'https://github.com/sekael/tourenbuddy-native.git' }
  s.static_framework = true
  s.source_files     = '*.m'
end
