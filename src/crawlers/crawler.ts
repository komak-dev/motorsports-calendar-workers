import { EventSchema } from "../types/schemas/event";
import { SeriesSchema } from "../types/schemas/series";

export default abstract class Crawler {
    abstract crawl(): Promise<EventSchema[]>;
    abstract getSeries(): SeriesSchema;

    async run(): Promise<SeriesSchema> {
        const series = this.getSeries();
        series.events = await this.crawl();
        return series;
    }

    async fetch(url: string): Promise<string | null> {
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        const headers = new Headers({
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "DNT": "1",
            "Upgrade-Insecure-Requests": "1",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-User": "?1",
            "Sec-Fetch-Dest": "document",
            "Referer": url,
            "Sec-CH-UA": '"Chromium";v="120", "Google Chrome";v="120", "Not:A-Brand";v="99"',
            "Sec-CH-UA-Mobile": "?0",
        });

        try {
            const res = await fetch(url, {
                method: "GET",
                headers,
                redirect: "follow",
                signal: controller.signal,
            });

            if (!res.ok) {
                return null;
            }

            return await res.text();
        } catch (err) {
            return null;
        } finally {
            clearTimeout(timeout);
        }
    }
}
