// https://www.fiawec.com/en/#

import { EventSchema } from "../types/schemas/event";
import { SeriesSchema } from "../types/schemas/series";
import { SessionSchema } from "../types/schemas/session";
import Crawler from "./crawler";
import { load } from "cheerio";
import { DateTime } from "luxon";

export default class WecCrawler extends Crawler {
    override getSeries(): SeriesSchema {
        return {
            name: "FIA WEC",
            genre: "Endurance",
            seriesUrl: "https://www.fiawec.com/en/#",
            logoUrl: "https://www.fiawec.com/uploads/logo-wec-cyan-navy-67f5358f785c2353364808-688b8233b14d7197474917-1-68b85665871a1417001656.png",
            events: []
        };
    }

    override async crawl(): Promise<EventSchema[]> {
        const baseUrl = "https://www.fiawec.com/en/";
        const html = await this.fetch(baseUrl);
        if (!html) return [];
        const $basePage = load(html);

        const eventUrls = new Set($basePage(".season-content a").toArray().map(el => {
            return `https://www.fiawec.com${$basePage(el).attr("href")}`;
        }));

        let events: EventSchema[] = [];

        for (const eventUrl of eventUrls) {
            const eventHtml = await this.fetch(eventUrl);
            if (!eventHtml) continue;
            const $eventPage = load(eventHtml);

            const eventName = $eventPage(".text-center .ff-headings").first().text().trim().replace(/\s+/g, " ");
            const ldJsonStr = $eventPage('script[type="application/ld+json"]').last().html()!;
            const ldJson = JSON.parse(ldJsonStr);
            let location = "";
            if (ldJson.location.name.includes("WEC - ")) {
                location = ldJson.location.name.replace("WEC - ", "").trim();
            } else if (ldJson.location.name.includes("ELMS - ")) {
                location = ldJson.location.name.replace("ELMS - ", "").trim();
            } else if (ldJson.location.name.includes("International Circuit")) {
                location = ldJson.location.name.replace("International Circuit", "").trim();
            } else if (eventName.includes("Le Mans")) {
                location = "Le Mans";
            }
            const offsetGMT = ldJson.startDate.slice(-6);
            const dateRangeText = $eventPage(".text-center .ff-headings").first().next().text().trim();
            const year = dateRangeText.slice(-4);
            const { 'start': startDate, 'end': endDate } = this.parseDateRange(dateRangeText);
            console.log(eventName, location, startDate, endDate);

            let sessions: SessionSchema[] = [];

            for (const dayEl of $eventPage("div.grid").first().children("div").toArray()) {
                const dayText = $eventPage(dayEl).find("div").first().text().trim();
                for (const sessionEl of $eventPage(dayEl).find("div").eq(1).find("div").toArray()) {
                    let sessionName = $eventPage(sessionEl).find("div").first().text().trim();
                    if (!sessionName) continue;
                    const timeText = $eventPage(sessionEl).find("div").eq(1).text().trim().split("/")[0].trim();
                    if (timeText.includes("TBC")) continue;
                    const datetime = this.parseDateTime(year, dayText, timeText, offsetGMT);

                    let sessionType = "Other";
                    if (sessionName.includes("Practice")) {
                        sessionType = "Practice";
                    } else if (sessionName.includes("Qualifying - LMGT3")) {
                        sessionName = "Qualifying";
                        sessionType = "Qualifying";
                    } else if (sessionName.includes("Race")) {
                        sessionType = "Race";
                    } else { 
                        continue;
                    }

                    sessions.push({
                        sessionDatetime: datetime,
                        sessionType: sessionType as SessionSchema["sessionType"],
                        sessionName: sessionName
                    });
                }
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

        return events;
    }

    parseDateRange(dateRangeText: string) { // From 18 to 20 April 2025
        const year = dateRangeText.slice(-4);
        let startMonth = "";
        let startDay = "";
        let endMonth = "";
        let endDay = "";

        if (dateRangeText.split(" ").length == 6) {
            const parts = dateRangeText.split(" ");
            startDay = parts[1];
            endDay = parts[3];
            startMonth = parts[4].slice(0, 3);
            endMonth = parts[4].slice(0, 3);
        } else {
            const parts = dateRangeText.split(" ");
            startDay = parts[1];
            startMonth = parts[2].slice(0, 3);
            endDay = parts[4];
            endMonth = parts[5].slice(0, 3);
        }

        const monthMap: { [key: string]: string } = {
            Jan: "01", Feb: "02", Mar: "03", Apr: "04",
            May: "05", Jun: "06", Jul: "07", Aug: "08",
            Sep: "09", Oct: "10", Nov: "11", Dec: "12"
        };

        return { 
            start: `${year}-${monthMap[startMonth]}-${startDay}`, 
            end: `${year}-${monthMap[endMonth]}-${endDay}` 
        };
    }

    parseDateTime(year: string, dateText: string, timeText: string, offsetGMT: string) { // April 19th 03:30 PM
        const monthMap: { [key: string]: string } = {
            January: "01", February: "02", March: "03", April: "04",
            May: "05", June: "06", July: "07", August: "08",
            September: "09", October: "10", November: "11", December: "12"
        };

        const dateParts = dateText.replace(/(st|nd|rd|th)/, "").split(" ");
        const month = monthMap[dateParts[0]];
        const day = dateParts[1].padStart(2, '0');

        const timeParts = timeText.split(" ");
        let [hour, minute] = timeParts[0].split(":").map(Number);
        const ampm = timeParts[1];
        if (ampm === "PM" && hour < 12) hour += 12;
        if (ampm === "AM" && hour === 12) hour = 0;
        const hourStr = hour.toString().padStart(2, '0');
        const minuteStr = minute.toString().padStart(2, '0');

        const datetimeStr = `${year}-${month}-${day}T${hourStr}:${minuteStr}:00${offsetGMT}`;
        const datetime = DateTime.fromISO(datetimeStr).toISO();

        return datetime ?? "";
    }
}