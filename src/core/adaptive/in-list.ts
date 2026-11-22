import { createContext } from 'react';

/**
 * iOS: true inside a page's SwiftUI `List` or `Form`. A view there is SwiftUI content already; a
 * second `Host` inside a row gets no height from the list and shows as a clipped strip.
 */
export const InSwiftUIList = createContext(false);
