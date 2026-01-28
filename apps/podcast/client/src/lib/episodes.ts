import { parse as parseFeed } from 'rss-to-json'
import { array, number, object, parse, string } from 'valibot'

const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'https://hollyweb-podcast-server.fly.dev'
const feedUrl = `${baseUrl}/api/feed`

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
    console.log('[episodes.ts] ==> START FETCH')
    console.log('[episodes.ts] Environment:', process.env.NODE_ENV)
    console.log('[episodes.ts] NEXT_PUBLIC_API_URL:', process.env.NEXT_PUBLIC_API_URL)
    console.log('[episodes.ts] Final feedUrl:', feedUrl)
    console.log('[episodes.ts] Fetching feed from:', feedUrl)
    
    let feed = (await parseFeed(feedUrl)) as unknown
    
    console.log('[episodes.ts] ==> FEED FETCHED')
    console.log('[episodes.ts] Feed type:', typeof feed)
    console.log('[episodes.ts] Feed keys:', feed ? Object.keys(feed) : 'null')
    console.log('[episodes.ts] Raw feed data:', JSON.stringify(feed, null, 2))
    
    if (!feed) {
      console.error('[episodes.ts] parseFeed returned null/undefined')
      return []
    }

    console.log('[episodes.ts] ==> PARSING WITH VALIBOT')
    let items = parse(FeedSchema, feed).items
    console.log('[episodes.ts] ==> PARSED ITEMS:', items.length, 'items')
    console.log('[episodes.ts] Parsed items:', JSON.stringify(items, null, 2))

    console.log('[episodes.ts] ==> MAPPING TO EPISODES')
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
    console.log('[episodes.ts] ==> RETURNING', episodes.length, 'EPISODES')
    return episodes
  } catch (error) {
    console.error('[episodes.ts] ==> ERROR OCCURRED')
    console.error('[episodes.ts] Error type:', error?.constructor?.name)
    console.error('[episodes.ts] Error fetching/parsing feed:', error)
    console.error('[episodes.ts] Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      raw: error,
    })
    return []
  }
}
