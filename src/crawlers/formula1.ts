import { EventSchema } from "../types/schemas/event";
import { SeriesSchema } from "../types/schemas/series";
import { SessionSchema } from "../types/schemas/session";
import Crawler from "./crawler";
import { load } from "cheerio";
import { DateTime } from "luxon";

export default class Formula1Crawler extends Crawler {
    override getSeries(): SeriesSchema {
        return {
            name: "Formula 1",
            genre: "Open-Wheel",
            seriesUrl: "https://www.formula1.com/",
            logoUrl: "https://www.formula1.com/assets/home/_next/static/media/f1-logo.43a01c6b.svg",
            events: []
        };
    }
    

    override async crawl(): Promise<EventSchema[]> {
        const thisYear = new Date().getFullYear();
        const baseUrls = [
            `https://www.formula1.com/en/racing/${thisYear - 1}`,
            `https://www.formula1.com/en/racing/${thisYear}`,
            `https://www.formula1.com/en/racing/${thisYear + 1}`,
        ];

        let events: EventSchema[] = [];

        for (const baseUrl of baseUrls) {
            const year = baseUrl.split("/").at(-1);

            const html = await this.fetch(baseUrl);
            if (!html) continue;
            const $basePage = load(html);

            for (const eventCardEl of $basePage("div.grid > a").toArray()) {
                const eventUrl = `https://www.formula1.com${$basePage(eventCardEl).attr("href")}`;
                const location = $basePage(eventCardEl).find("div > div p").first().text().trim();
                const eventName = $basePage(eventCardEl).find("div > div > span").eq(2).text().split("FORMULA 1")[1].trim();
                let dateRangeText = $basePage(eventCardEl).find("div > div > div > span").eq(0).text();
                if (!this.isDataRangeText(dateRangeText)) dateRangeText = $basePage(eventCardEl).find("div > div > span > span > span").text();
                if (!this.isDataRangeText(dateRangeText)) dateRangeText = $basePage(eventCardEl).find("div > div > div > span").eq(3).text();
                const { 'start': startDate, 'end': endDate } = this.parseDateRange(dateRangeText);
                console.log(eventName, location, startDate, endDate);

                let sessions: SessionSchema[] = [];

                const eventHtml = await this.fetch(eventUrl);
                if (eventHtml) {
                    const $eventPage = load(eventHtml);
                    for (const sessionEl of $eventPage("ul.grid").first().find("li").toArray()) {
                        const dayText = $eventPage(sessionEl).children("span").first().text().trim();
                        const timeText = $eventPage(sessionEl).find("time").first().text().trim();
                        const month = dayText.slice(2, 5);
                        const day = dayText.slice(0, 2).trim();
                        const datetime = this.parseFromParts(month, day, year!, timeText);

                        const sessionName = $eventPage(sessionEl).children("span").eq(2).find("span").first().text().trim();
                        const sessionType = sessionName.includes("Practice") ? "Practice"
                            : sessionName.includes("Qualifying") ? "Qualifying"
                            : sessionName === "Race" || sessionName === "Sprint" ? "Race"
                            : "Testing";
                        
                        sessions.push({
                            sessionDatetime: datetime,
                            sessionName: sessionName,
                            sessionType: sessionType,
                        });
                    }
                }

                events.push({
                    eventUrl: eventUrl,
                    eventName: eventName,
                    eventStartDate: `${year}-${startDate}`,
                    eventEndDate: `${year}-${endDate}`,
                    location: location,
                    sessions: sessions
                });
            }
        }

        return events;
    } 

    isDataRangeText(text: string) { // "14 - 16 Mar" || "30 May - 01 Jun"
        const regex = /^\d{1,2}( \w{3})? - \d{1,2} \w{3}$/;
        return regex.test(text);
    }

    parseDateRange(dateRangeText: string) { // '26 - 28 Feb' -> { start: '02-26', end: '02-28' }, '30 May - 01 Jun' -> { start: '05-30', end: '06-01' }
        let startDay: string, startMonth: string, endDay: string, endMonth: string;
        if (dateRangeText.split(" ").length === 4) {
            [startDay, , endDay, endMonth] = dateRangeText.split(" ");
            startMonth = endMonth;
        } else {
            [startDay, startMonth, , endDay, endMonth] = dateRangeText.split(" ");
        }

        const monthMap: { [key: string]: string } = {
            Jan: "01", Feb: "02", Mar: "03", Apr: "04",
            May: "05", Jun: "06", Jul: "07", Aug: "08",
            Sep: "09", Oct: "10", Nov: "11", Dec: "12"
        };

        return {
            start: `${monthMap[startMonth]}-${startDay.padStart(2, '0')}`,
            end: `${monthMap[endMonth]}-${endDay.padStart(2, '0')}`
        };
    }

    parseFromParts(
        month: string,
        day: string | number,
        year: string | number,
        time: string,
        zone = "Asia/Tokyo"
    ) {
        const base = `${day} ${month} ${year} ${time}`;
        const dt = DateTime.fromFormat(base, "d LLL yyyy HH:mm", { zone, locale: "en" });
        return dt.toUTC().toISO() ?? "TBD";
    }
}
