/**
 * BookshelfWidget
 *
 * iOS home screen widget that displays book spines from a selected shelf.
 * Built with expo-widgets (Expo SDK 55) using @expo/ui/swift-ui components,
 * replacing the previous native Swift WidgetKit extension.
 */

import { HStack, Image, Text, VStack } from '@expo/ui/swift-ui';
import {
  clipShape,
  font,
  foregroundStyle,
  frame,
  padding,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, WidgetBase } from 'expo-widgets';

export type BookshelfWidgetProps = {
  shelfId: string | null;
  shelfName: string | null;
  books: Array<{
    id: string;
    title: string;
    author: string;
    image_url: string | null;
  }>;
};

function maxBooksForFamily(family: string): number {
  switch (family) {
    case 'systemSmall':
      return 4;
    case 'systemMedium':
      return 8;
    default:
      return 12;
  }
}

function spineWidthForFamily(family: string): number {
  switch (family) {
    case 'systemSmall':
      return 32;
    case 'systemMedium':
      return 36;
    default:
      return 40;
  }
}

const BookshelfWidget = (props: WidgetBase<BookshelfWidgetProps>) => {
  'widget';

  if (!props.shelfName) {
    return (
      <VStack>
        <Text
          modifiers={[
            font({ size: 13 }),
            foregroundStyle('#888888'),
          ]}
        >
          Long-press to choose a shelf
        </Text>
      </VStack>
    );
  }

  const maxBooks = maxBooksForFamily(props.family);
  const spineWidth = spineWidthForFamily(props.family);
  const books = props.books.slice(0, maxBooks);
  const deepLinkURL = `virtuallibrary://bookshelf?id=${props.shelfId}`;

  return (
    <VStack
      alignment="leading"
      spacing={8}
      modifiers={[
        padding(12),
        widgetURL(deepLinkURL),
      ]}
    >
      <Text modifiers={[font({ weight: 'bold', size: 14 })]}>
        {props.shelfName}
      </Text>
      <HStack alignment="bottom" spacing={4}>
        {books.map((book) => (
          <Image
            key={book.id}
            source={{ uri: book.image_url ?? '' }}
            resizable
            scaledToFit
            modifiers={[
              frame({ width: spineWidth, height: spineWidth * 1.5 }),
              clipShape('roundedRectangle', { cornerRadius: 3 }),
            ]}
          />
        ))}
      </HStack>
    </VStack>
  );
};

export default createWidget('BookshelfWidget', BookshelfWidget);
