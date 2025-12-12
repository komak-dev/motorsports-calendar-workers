import { EventSchema } from "../types/schemas/event";
import { SeriesSchema } from "../types/schemas/series";
import { SessionSchema } from "../types/schemas/session";
import Crawler from "./crawler";
import { load } from "cheerio";
import { DateTime } from "luxon";

export default class SuperFormulaCrawler extends Crawler {
    override getSeries(): SeriesSchema {
        return {
            name: "Super Formula",
            genre: "Open-Wheel",
            seriesUrl: "https://superformula.net/",
            logoUrl: "https://superformula.net/sf3/common/img/logo_sf3.svg",
            events: []
        };
    }

    override async crawl(): Promise<EventSchema[]> {
        const thisYear = new Date().getFullYear();
        const baseUrls = [
            `https://superformula.net/sf3/race_taxonomy/${thisYear - 1}/`,
            `https://superformula.net/sf3/race_taxonomy/${thisYear}/`,
            `https://superformula.net/sf3/race_taxonomy/${thisYear + 1}/`,
        ];

        let events: EventSchema[] = [];

        for (const baseUrl of baseUrls) {
            const year = baseUrl.split("/").at(-2);

            const html = await this.fetch(baseUrl);
            if (!html) continue;
            const $basePage = load(html);

            for (const eventCardEl of $basePage("ul.common_race_list01 > li").toArray()) {
                const eventUrl = $basePage(eventCardEl).find("a").attr("href")!;
                const location = $basePage(eventCardEl).find(".en").text().trim();
                const eventName = $basePage(eventCardEl).find(".roboto").first().text().trim();
                const dateRangeText = $basePage(eventCardEl).find(".inner01_txt01").text().trim();//.split("\n")[0].trim();
                console.log("dataRange:", dateRangeText);
                const { 'start': startDate, 'end': endDate } = this.parseDateRange(dateRangeText);


                const eventHtml = await this.fetch(eventUrl);
                if (!eventHtml) continue;
                const $eventPage = load(eventHtml);

                let sessions: SessionSchema[] = [];

                for (const timeTableEl of $eventPage("div.table_time_schedule > div > table").toArray()) {
                    const year = baseUrl.split("/").at(-2);
                    const [month, day] = $eventPage(timeTableEl).find("caption").text().trim().split("(")[0].split(".");

                    for (const sessionEl of $eventPage(timeTableEl).find("tbody > tr").toArray()) {
                        const timeText = $eventPage(sessionEl).find("th").text().trim().split("-")[0].trim();
                        const datetime = this.parseFromParts(month, day, year!, timeText);
                        if (!datetime) continue;

                        const rawSessionName = $eventPage(sessionEl).find("td").text().trim();
                        let sessionName = "";
                        let sessionType = "Other";
                        if (rawSessionName.includes("FP")) {
                            sessionName = rawSessionName.match(/FP\d+/)?.[0] ?? "Practice";
                            sessionType = "Practice";
                        } else if (rawSessionName.includes("予選")) {
                            const round = rawSessionName.match(/Rd\.\d+/)?.[0] ?? "";
                            if (!rawSessionName.includes("Q1") || !rawSessionName.includes("Gr") || !rawSessionName.includes("A")) continue;
                            if (round) sessionName = `${round} Qualifying`;
                            else sessionName = `Qualifying`;
                            sessionType = "Qualifying";
                        } else if (rawSessionName.includes("決勝")) {
                            const round = rawSessionName.match(/Rd\.\d+/)?.[0] ?? "";
                            if (round) sessionName = `${round} Race`;
                            else sessionName = "Race";
                            sessionType = "Race";
                        } else if (rawSessionName.includes("Session") || rawSessionName.includes("SESSION")) {
                            sessionName = rawSessionName;
                            sessionType = "Testing";
                        } else {
                            continue;
                        }

                        const displayText = `${location} - ${sessionName}`;
                        console.log("SF", displayText, datetime, sessionType);

                        sessions.push({
                            sessionDatetime: datetime,
                            sessionName: sessionName,
                            sessionType: sessionType as SessionSchema["sessionType"],
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

    parseDateRange(dateRangeText: string) { // '5月17日(土)~ 18日(日)' '6月30日(金)~7月1日(土)'
        const [startPart, endPart] = dateRangeText.split("~").map(s => s.trim());
        const startMonth = startPart.split("月")[0];
        const startDay = startPart.split("月")[1].split("日")[0];
        let endMonth, endDay;
        if (endPart.includes("月")) {
            endMonth = endPart.split("月")[0];
            endDay = endPart.split("月")[1].split("日")[0];
        } else {
            endMonth = startMonth;
            endDay = endPart.split("日")[0];
        }

        const pad = (n: string) => n.padStart(2, "0");

        return {
            start: `${pad(startMonth)}-${pad(startDay)}`,
            end: `${pad(endMonth)}-${pad(endDay)}`,
        };
    }

    parseFromParts(
        month: string,
        day: string,
        year: string,
        time: string,
        zone = "Asia/Tokyo"
    ) {
        const base = `${day} ${month} ${year} ${time}`;
        const start = DateTime.fromFormat(base, "d M yyyy HH:mm", { zone, locale: "en" });
        const dt = DateTime.fromFormat(base, "d M yyyy HH:mm", { zone, locale: "en" });
        return dt.toUTC().toISO() ?? "";
    }
}