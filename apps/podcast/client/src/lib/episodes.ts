import { parse as parseFeed } from 'rss-to-json'
import { array, number, object, parse, string } from 'valibot'

const feedUrl =
  process.env.NEXT_PUBLIC_API_URL || 'https://hollyweb-podcast-server.fly.dev/api/feed'

export interface Episode {
  id: number
  title: string
  published: Date
  description: string
  content: string
  audio: {
    src: string
    type: string
  }
}

export async function getAllEpisodes() {
  let FeedSchema = object({
    items: array(
      object({
        id: number(),
        title: string(),
        published: number(),
        description: string(),
        content: string(),
        enclosures: array(
          object({
            url: string(),
            type: string(),
          }),
        ),
      }),
    ),
  })

  try {
    console.log('[episodes.ts] Fetching feed from:', feedUrl)
    let feed = (await parseFeed(feedUrl)) as unknown
    console.log('[episodes.ts] Raw feed data:', JSON.stringify(feed, null, 2))
    
    if (!feed) {
      console.error('[episodes.ts] parseFeed returned null/undefined')
      return []
    }

    let items = parse(FeedSchema, feed).items
    console.log('[episodes.ts] Parsed items:', items)

    let episodes: Array<Episode> = items.map(
      ({ id, title, description, content, enclosures, published }) => ({
        id,
        title: `${id}: ${title}`,
        published: new Date(published),
        description,
        content,
        audio: enclosures.map((enclosure) => ({
          src: enclosure.url,
          type: enclosure.type,
        }))[0],
      }),
    )
    return episodes
  } catch (error) {
    console.error('[episodes.ts] Error fetching/parsing feed:', error)
    console.error('[episodes.ts] Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    })
    return []
  }
}
