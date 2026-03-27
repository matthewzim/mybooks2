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
 * Props passed to the widget from the configurable timeline provider.
 * The native AppIntent selects a bookshelf and passes its data here.
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
  return `hsl(${hue}, 50%, 55%)`;
}

/**
 * Returns the max number of book spines to show for a given widget family.
 * Medium = 1 row (7 books), Large = 2 rows (14 books).
 */
function maxBooksForFamily(family: string): number {
  switch (family) {
    case 'systemMedium':
      return 7;
    default:
      return 14;
  }
}

/**
 * Renders a single row of book spines.
 */
function SpineRow({
  books,
  spineWidth,
  spineHeight,
}: {
  books: BookshelfWidgetProps['books'];
  spineWidth: number;
  spineHeight: number;
}) {
  return (
    <HStack>
      {books.map((book) => (
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
  );
}

/**
 * BookshelfWidget component rendered using @expo/ui SwiftUI primitives.
 * Medium: single horizontal row of spines.
 * Large: two horizontal rows of spines.
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

  const spineWidth = 36;
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

  const isLarge = family === 'systemLarge';
  const booksPerRow = 7;
  const topRow = visibleBooks.slice(0, booksPerRow);
  const bottomRow = isLarge ? visibleBooks.slice(booksPerRow, booksPerRow * 2) : [];

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

      {/* First row of spines */}
      <SpineRow books={topRow} spineWidth={spineWidth} spineHeight={spineHeight} />

      {/* Second row of spines (large only) */}
      {isLarge && bottomRow.length > 0 && (
        <SpineRow books={bottomRow} spineWidth={spineWidth} spineHeight={spineHeight} />
      )}
    </VStack>
  );
};

export default createWidget('BookshelfWidget', BookshelfWidget);
