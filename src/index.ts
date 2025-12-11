import Formula1Crawler from './crawlers/formula1';
import IndyCarCrawler from './crawlers/indycar';
import SuperFormulaCrawler from './crawlers/super-formula';

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === '/crawl/formula1') {
			const crawler = new Formula1Crawler();
			const results = await crawler.run();
			return Response.json(results);
		} else if (url.pathname === '/crawl/indycar') {
			const crawler = new IndyCarCrawler();
			const results = await crawler.run();
			return Response.json(results);
		} else if (url.pathname === '/crawl/super-formula') {
			const crawler = new SuperFormulaCrawler();
			const results = await crawler.run();
			return Response.json(results);
		}

		return new Response('Hello World!');
	},
} satisfies ExportedHandler<Env>;
