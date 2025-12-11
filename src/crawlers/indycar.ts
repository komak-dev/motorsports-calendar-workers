import { EventSchema } from "../types/schemas/event";
import { SeriesSchema } from "../types/schemas/series";
import { SessionSchema } from "../types/schemas/session";
import Crawler from "./crawler";
import { load } from "cheerio";
import { DateTime } from "luxon";

export default class IndyCarCrawler extends Crawler {
    override getSeries(): SeriesSchema {
        return {
            name: "IndyCar",
            genre: "Open-Wheel",
            seriesUrl: "https://www.indycar.com/",
            logoUrl: "https://www.indycar.com/-/media/IndyCar/Logos/INDYCAR-Dark.png",
            events: []
        };
    }

    override async crawl(): Promise<EventSchema[]> {
        const thisYear = new Date().getFullYear();
        const baseUrls = [
            `https://www.indycar.com/Schedule?year=${thisYear - 1}`,
            `https://www.indycar.com/Schedule?year=${thisYear}`,
            `https://www.indycar.com/Schedule?year=${thisYear + 1}`,
        ];

        let events: EventSchema[] = [];
        let visitedEventUrls = new Set<string>();

        for (const baseUrl of baseUrls) {
            const year = baseUrl.split("=").at(-1);

            const html = await this.fetch(baseUrl);
            if (!html) continue;
            const $basePage = load(html);

            for (const eventCardEl of $basePage(".schedule-list-container .event-card").toArray()) {
                const eventUrl = `https://www.indycar.com${$basePage(eventCardEl).find("a").attr("href")}`;
                if (visitedEventUrls.has(eventUrl)) continue;
                visitedEventUrls.add(eventUrl);

                const eventHtml = await this.fetch(eventUrl);
                if (!eventHtml) continue;
                const $eventPage = load(eventHtml);

                let sessions: SessionSchema[] = [];

                const eventName = $eventPage("h1.headline").text().trim();
                const [dateRangeText, location] = $eventPage(".subhead").text().trim().split("|").map(s => s.trim());
                const { 'start': startDate, 'end': endDate } = this.parseDateRange(dateRangeText);

                const scheduleContentTableEl = $eventPage("#schedule-content .schedule-table").first();

                let currentDateStr = "";
                for (const rowEl of $eventPage(scheduleContentTableEl).children().toArray()) {
                    if ($eventPage(rowEl).prop("tagName") === "H3") {
                        currentDateStr = $eventPage(rowEl).text().trim();
                        continue;
                    }
                    if ($eventPage(rowEl).hasClass("schedule-entry")) {
                        const timeText = $eventPage(rowEl).find(".schedule-time").text().trim().replace("ET", "").trim();
                        const month = currentDateStr.split(",")[1].trim().split(" ")[0];
                        const day = currentDateStr.split(",")[1].trim().split(" ")[1];
                        let datetime = this.parseFromParts(month, day, year!, timeText, "America/New_York");

                        if (!datetime) continue;

                        let sessionName = $eventPage(rowEl).find(".schedule-description").text().trim();
                        if (sessionName.startsWith("NTT INDYCAR SERIES -")) {
                            sessionName = sessionName.replace("NTT INDYCAR SERIES -", "").trim();
                            const sessionType = sessionName.includes("Practice") || sessionName.includes("Warmup") ? "Practice"
                                : sessionName.includes("Qualifications") ? "Qualifying"
                                : sessionName.includes("Race") ? "Race"
                                : "Other";

                            console.log(eventName, location, datetime, sessionName, sessionType);

                            sessions.push({
                                sessionDatetime: datetime,
                                sessionName: sessionName,
                                sessionType: sessionType,
                            });
                        }
                    }
                }
                events.push({
                    eventUrl: eventUrl,
                    eventName: eventName,
                    eventStartDate: `${year}-${startDate}`,
                    eventEndDate: `${year}-${endDate}`,
                    location: location,
                    sessions: sessions,
                });
            }
        }

        return events;
    }

    parseDateRange(dateRangeText: string) { // "February 27 - March 1", "March 6 - 7"
        let startDay: string, startMonth: string, endDay: string, endMonth: string;
        if (dateRangeText.split(" ").length === 4) {
            [startMonth, startDay, , endDay] = dateRangeText.split(" ");
            startMonth = startMonth.slice(0, 3);
            endMonth = startMonth;
        } else {
            [startMonth, startDay, , endMonth, endDay] = dateRangeText.split(" ");
            startMonth = startMonth.slice(0, 3);
            endMonth = endMonth.slice(0, 3);
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
        day: string,
        year: string,
        time: string,
        zone = "Asia/Tokyo"
    ) {
        const timeNorm = String(time).trim().replace(/([0-9]{1,2}:[0-9]{2})(AM|PM)$/, "$1 $2");
        const base = `${day} ${month} ${year} ${timeNorm}`;
        let dt = DateTime.fromFormat(base, "d LLL yyyy h:mm a", { zone, locale: "en" });
        return dt.toUTC().toISO() ?? "";
    }
}