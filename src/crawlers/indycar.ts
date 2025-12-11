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
            logoUrl: "https://www.indycar.com/etc.clientlibs/indycar/clientlibs/clientlib-site/resources/indycar-logo.svg",
            events: []
        };
    }

    override async run(): Promise<EventSchema[]> {
        const thisYear = new Date().getFullYear();
        const baseUrls = [
            // `https://www.indycar.com/Schedule?year=${thisYear - 1}`,
            // `https://www.indycar.com/Schedule?year=${thisYear}`,
            `https://www.indycar.com/Schedule?year=${thisYear + 1}`,
        ];

        let calendarItems: EventSchema[] = [];
        let visitedEventUrls = new Set<string>();

        for (const baseUrl of baseUrls) {
            const html = await this.fetch(baseUrl);
            const $basePage = load(html);

            for (const scheduleListEl of $basePage(".schedule-list-container").toArray()) {
                for (const eventCardEl of $basePage(scheduleListEl).find(".event-card").toArray()) {
                    const eventUrl = `https://www.indycar.com${$basePage(eventCardEl).find("a").attr("href")}`;
                    if (visitedEventUrls.has(eventUrl)) continue;
                    visitedEventUrls.add(eventUrl);

                    const eventHtml = await this.fetch(eventUrl);
                    const $eventPage = load(eventHtml);

                    const subheadText = $eventPage(".subhead").text().trim();
                    const location = subheadText.split("|")[1].trim().split(",")[0].trim();

                    const scheduleContentTableEl = $eventPage("#schedule-content .schedule-table").first();

                    let currentDateStr = ""; // let Saturday, Mar 1
                    for (const rowEl of $eventPage(scheduleContentTableEl).children().toArray()) {
                        if ($eventPage(rowEl).prop("tagName") === "H3") {
                            currentDateStr = $eventPage(rowEl).text().trim(); // Friday, Mar 8
                            continue;
                        }
                        if ($eventPage(rowEl).hasClass("schedule-entry")) {
                            const timeText = $eventPage(rowEl).find(".schedule-time").text().trim().replace("ET", "").trim();
                            const year = baseUrl.split("=").at(-1);
                            const month = currentDateStr.split(",")[1].trim().split(" ")[0];
                            const day = currentDateStr.split(",")[1].trim().split(" ")[1];
                            let datetime = this.parseFromParts(month, day, year!, timeText, "America/New_York");
                            let isSessionTimeTBA = false;

                            if (!datetime) {
                                const rawTrackDate = subheadText.split("|")[0].trim();
                                const trackMonth = rawTrackDate.split(" ")[0].slice(0, 3);
                                const trackDay = rawTrackDate.split(" ")[1];
                                console.log("IndyCar TBA date:", rawTrackDate, "|", trackMonth, "|", trackDay);
                                datetime = this.parseFromParts(trackMonth, trackDay, year!, "00:00", "America/New_York").slice(0, 10);
                                isSessionTimeTBA = true;
                            }

                            const sessionName = $eventPage(rowEl).find(".schedule-description").text().trim();
                            if (sessionName.startsWith("NTT INDYCAR SERIES -")) {
                                const session = sessionName.replace("NTT INDYCAR SERIES -", "").trim();
                                const displayText = `${location} - ${session}`;
                                const sessionType = session.includes("Practice") || session.includes("Warmup") ? "Practice"
                                    : session.includes("Qualifications") ? "Qualifying"
                                    : session.includes("Race") ? "Race"
                                    : "Other";

                                // const calendarItem: CalendarItemSchema = {
                                //     series: {
                                //         name: "IndyCar",
                                //         genre: "Open-Wheel",
                                //         url: "https://www.indycar.com/",
                                //         logoUrl: "https://www.indycar.com/-/media/indycar/images/indycar-logo.png",
                                //     },
                                //     sessionUrl: eventUrl,
                                //     trackDate: "",
                                //     sessionDatetime: datetime,
                                //     displayText: displayText,
                                //     sessionType: sessionType,
                                //     isSessionTimeTBA: isSessionTimeTBA,
                                // };

                                // console.log("IndyCar", displayText, datetime, sessionType);
                                // calendarItems.push(calendarItem);
                            }
                        }
                    }
                }
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
        const timeNorm = String(time).trim().replace(/([0-9]{1,2}:[0-9]{2})(AM|PM)$/, "$1 $2");
        const base = `${day} ${month} ${year} ${timeNorm}`;
        let dt = DateTime.fromFormat(base, "d LLL yyyy h:mm a", { zone, locale: "en" });
        return dt.toUTC().toISO() ?? "";
    }
}