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

        let calendarItems: EventSchema[] = [];

        for (const baseUrl of baseUrls) {
            try {
                const html = await this.fetch(baseUrl);
                const $basePage = load(html);

                for (const eventCardEl of $basePage("ul.common_race_list01 > li").toArray()) {
                    const eventUrl = $basePage(eventCardEl).find("a").attr("href")!;
                    const location = $basePage(eventCardEl).find(".en").text().trim();

                    try {
                        const eventHtml = await this.fetch(eventUrl);
                        const $eventPage = load(eventHtml);

                        for (const timeTableEl of $eventPage("div.table_time_schedule > div > table").toArray()) {
                            const year = baseUrl.split("/").at(-2);
                            const [month, day] = $eventPage(timeTableEl).find("caption").text().trim().split("(")[0].split(".");

                            for (const sessionEl of $eventPage(timeTableEl).find("tbody > tr").toArray()) {
                                const timeText = $eventPage(sessionEl).find("th").text().trim().split("-")[0].trim();
                                const datetime = this.parseFromParts(month, day, year!, timeText);

                                const rawSessionName = $eventPage(sessionEl).find("td").text().trim();
                                let sessionName = "";
                                let sessionType = "Other";
                                if (rawSessionName.includes("FP")) {
                                    sessionName = rawSessionName.match(/FP\d+/)?.[0] ?? "Practice";
                                    sessionType = "Practice";
                                } else if (rawSessionName.includes("予選")) {
                                    const round = rawSessionName.match(/Rd\.\d+/)?.[0] ?? "";
                                    const qualiSession = rawSessionName.split("予選")[1].trim();
                                    if (!rawSessionName.includes("Q1") || !rawSessionName.includes("GrA")) continue;
                                    if (round) sessionName = `${round} Qualifying`;
                                    else sessionName = "Qualifying";
                                    sessionType = "Qualifying";
                                } else if (rawSessionName.includes("決勝")) {
                                    const round = rawSessionName.match(/Rd\.\d+/)?.[0] ?? "";
                                    if (round) sessionName = `${round} Race`;
                                    else sessionName = "Race";
                                    sessionType = "Race";
                                } else if (rawSessionName.includes("Session")) {
                                    sessionName = rawSessionName;
                                    sessionType = "Other";
                                } else {
                                    continue;
                                }

                                const displayText = `${location} - ${sessionName}`;
                                console.log("SF", displayText, datetime, sessionType);

                                // const calendarItem: CalendarItemSchema = {
                                //     series: {
                                //         name: "Super Formula",
                                //         genre: "Open-Wheel",
                                //         url: "https://superformula.net/",
                                //         logoUrl: "https://superformula.net/sf3/wp-content/themes/sf3/images/common/logo_sf3.svg",
                                //     },
                                //     sessionUrl: eventUrl,
                                //     trackDate: "",
                                //     sessionDatetime: datetime,
                                //     displayText: displayText,
                                //     sessionType: sessionType as "Practice" | "Qualifying" | "Race" | "Other",
                                //     isSessionTimeTBA: false,
                                // };
                                // calendarItems.push(calendarItem);
                            }
                        }


                    } catch (error) {
                        console.error(`Error fetching event page ${eventUrl}:`, error);
                        continue;
                    }
                }
            } catch (error) {
                console.error(`Error fetching/parsing data from ${baseUrl}:`, error);
            }

        }

        return calendarItems;
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
        return dt.toUTC().toISO() ?? "TBD";
    }
}