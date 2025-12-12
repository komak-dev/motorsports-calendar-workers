// https://www.fiaformulae.com/en/calendar

import { EventSchema } from "../types/schemas/event";
import { SeriesSchema } from "../types/schemas/series";
import { SessionSchema } from "../types/schemas/session";
import Crawler from "./crawler";
import { load } from "cheerio";
import { DateTime } from "luxon";

export default class FormulaECrawler extends Crawler {
    override getSeries(): SeriesSchema {
        return {
            name: "Formula e",
            genre: "Open-Wheel",
            seriesUrl: "https://www.fiaformulae.com/",
            logoUrl: "https://www.fiaformulae.com/resources/v4.35.17/i/elements/formula-e-logo-championship.svg",
            events: []
        };
    }

    override async crawl(): Promise<EventSchema[]> {
        const baseUrl = "https://api.formula-e.pulselive.com/formula-e/v1/championships?statuses=Past,Present";
        const jsonStr = await this.fetch(baseUrl);
        if (!jsonStr) return [];
        const json = JSON.parse(jsonStr);
        const seasonCalendarUrls = json.championships.slice(-3).map((championship: any) => {
            const seasonId = championship.id;
            return `https://api.formula-e.pulselive.com/formula-e/v1/races?championshipId=${seasonId}`
        });

        let events: EventSchema[] = [];

        for (const calendarUrl of seasonCalendarUrls) {
            const calendarJsonStr = await this.fetch(calendarUrl);
            if (!calendarJsonStr) continue;
            const calendarJson = JSON.parse(calendarJsonStr);

            for (const event of calendarJson.races) {
                const eventUrl = `https://www.fiaformulae.com/en${event.metadata.racePath}`;
                const eventJsonUrl = `https://api.formula-e.pulselive.com/formula-e/v1/races/${event.id}/sessions?groupQualifyings=true&onlyActualEvents=true`;
                const eventName = event.name.slice(5).trim();
                const location = event.city;

                const eventJsonStr = await this.fetch(eventJsonUrl);
                if (!eventJsonStr) continue;
                const eventJson = JSON.parse(eventJsonStr);
                let startDate = "";
                let endDate = "";
                if (eventJson.sessions.length > 0) {
                    startDate = eventJson.sessions[0].sessionDate;
                    endDate = eventJson.sessions[eventJson.sessions.length - 1].sessionDate;
                } else {
                    startDate = event.date;
                    endDate = event.date;
                }

                console.log(eventName, location, startDate, endDate);

                let sessions: SessionSchema[] = [];

                for (const session of eventJson.sessions) {
                    const sessionName = session.sessionName;
                    const sessionDate = session.sessionDate;
                    const startTime = session.startTime;
                    const offsetGMT = session.offsetGMT;
                    const datetime = this.parseDateTime(sessionDate, startTime, offsetGMT);

                    const sessionType = sessionName.includes("Practice") ? "Practice"
                        : sessionName.includes("QUALIFYING") ? "Qualifying"
                        : sessionName.includes("Race") ? "Race"
                        : "Other";
                    
                    sessions.push({
                        sessionDatetime: datetime,
                        sessionName: sessionName,
                        sessionType: sessionType,
                    });
                }

                events.push({
                    eventName: eventName,
                    eventUrl: eventUrl,
                    eventStartDate: startDate,
                    eventEndDate: endDate,
                    location: location,
                    sessions: sessions,
                });
            }
        }

        return events;
    }

    parseDateTime(dateStr: string, timeStr: string, offsetGMT: string): string {
        const zone = offsetGMT === "00:00" ? "UTC" : `UTC${offsetGMT.startsWith("-") ? "" : "+"}${offsetGMT}`;
        const base = `${dateStr} ${timeStr}`;
        const dt = DateTime.fromFormat(base, "yyyy-MM-dd HH:mm", { zone, locale: "en" });
        return dt.toUTC().toISO() ?? "";
    }
}