import { registerRootComponent } from 'expo';

// The UI gallery (src/dev) is a browser-only review tool. EXPO_PUBLIC_* is inlined at bundle time, so in a
// normal build this condition is constant-false and Metro drops the gallery from the app entirely.
const Root = process.env.EXPO_PUBLIC_UI_GALLERY === '1'
  ? require('./src/dev/UiGallery').UiGallery
  : require('./App').default;

registerRootComponent(Root);
