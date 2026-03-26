import { Text, VStack, HStack, Section } from '@expo/ui/swift-ui';
import {
  font,
  foregroundStyle,
  frame,
  cornerRadius,
  padding,
  background,
  lineLimit,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

/**
 * Props passed to the widget via updateSnapshot / updateTimeline.
 * Mirrors the WidgetData shape from the app.
 */
type BookshelfWidgetProps = {
  bookshelfName: string | null;
  bookshelfId: string | null;
  books: {
    id: string;
    title: string;
    author: string;
    imageUrl: string | null;
  }[];
};

/**
 * Generates a stable hue from a string (same algorithm as the old Swift widget).
 */
function stableHue(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash += title.charCodeAt(i);
  }
  const hue = (hash % 360);
  // Return an HSL color string
  return `hsl(${hue}, 50%, 55%)`;
}

/**
 * Returns the max number of book spines to show for a given widget family.
 */
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

/**
 * BookshelfWidget component rendered using @expo/ui SwiftUI primitives.
 * Displays a bookshelf with book spines on the iOS home screen.
 */
const BookshelfWidget = (
  props: BookshelfWidgetProps,
  environment: WidgetEnvironment
) => {
  'widget';

  const { bookshelfName, bookshelfId, books } = props;
  const family = environment.widgetFamily;
  const maxBooks = maxBooksForFamily(family);
  const visibleBooks = books.slice(0, maxBooks);

  const spineWidth = family === 'systemSmall' ? 32 : family === 'systemMedium' ? 36 : 40;
  const spineHeight = Math.round(spineWidth * 1.5);

  // Empty state when no bookshelf is selected
  if (!bookshelfName || !bookshelfId) {
    return (
      <VStack modifiers={[padding({ all: 12 })]}>
        <Text
          modifiers={[
            font({ size: 13 }),
            foregroundStyle('#8E8E93'),
          ]}
        >
          Long-press to choose a shelf
        </Text>
      </VStack>
    );
  }

  return (
    <VStack
      modifiers={[
        padding({ all: 12 }),
      ]}
    >
      {/* Shelf name header */}
      <Text
        modifiers={[
          font({ weight: 'bold', size: 14 }),
          lineLimit(1),
        ]}
      >
        {bookshelfName}
      </Text>

      {/* Book spines row */}
      <HStack>
        {visibleBooks.map((book) => (
          <Section key={book.id}>
            <VStack
              modifiers={[
                frame({ width: spineWidth, height: spineHeight }),
                cornerRadius(3),
                background(stableHue(book.title)),
              ]}
            >
              <Text
                modifiers={[
                  font({ weight: 'bold', size: Math.round(spineWidth * 0.4) }),
                  foregroundStyle('#FFFFFF'),
                ]}
              >
                {book.title.charAt(0)}
              </Text>
            </VStack>
          </Section>
        ))}
      </HStack>
    </VStack>
  );
};

export default createWidget('BookshelfWidget', BookshelfWidget);
