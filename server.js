const express = require('express');
const path = require('path');
const fs = require('fs').promises
const fetch = require('node-fetch');
const Parser = require('rss-parser');
const app = express();
const parser = new Parser();

const config = {
    "port": 40, // Web Port
    "feed": "https://6abc.com/feed", // RSS Feed to pull headlines from
    "adBanner": "The Latest News from ARN 4 News", // The message that appears at the start of the crawl
    "fetchInterval": 15, // Time (in minutes) between updating data
    "twcApiKey": "e1f10a1e78da46f5b10a1e78da96f525", // TWC Api Key
    "weatherCities": ["08054:US", "08002:US", "08043:US", "08060:US", "08360:US", "08401:US"], // Locations to use for the weather segment
    "stockIndicies": ["^GSPC", "^DJI", "^IXIC", "NVDA", "GM", "MSFT", "AAPL", "DIS", "META"], // Indicies to use for the Stocks segment
    "sportLeagues": ["baseball/mlb","basketball/nba", "football/nfl", "hockey/nhl"],
}

app.use(express.static(path.join(__dirname)));
app.listen(config.port, () => { console.log('Started server') });

fs.writeFile((__dirname, 'clientCfg.js'), `const config = ${JSON.stringify(config)}`);

function formatDateTime(dateTimeString) {
    const date = new Date(dateTimeString);
    const options = {
        hour: 'numeric',
        minute: 'numeric',
        hour12: true,
        timeZoneName: 'short'
    };
    return date.toLocaleString('en-US', options);
}

function newLineToSpace(text) {
    return text.replace(/\n/g, ' ');
}

async function fetchFeed() {
    let feed = await parser.parseURL(config.feed);
    fs.writeFile((__dirname, 'data/feed.json'), JSON.stringify(feed));
    console.log('Sucessfully fetched RSS feed')
}

async function fetchWeather() {
    var list = [];
    var primaryCityDetails;
    for (let idx = 0; idx < config.weatherCities.length; idx++) {
        const itm = config.weatherCities[idx];
        const loc = await fetch(`https://api.weather.com/v3/location/point?postalKey=${itm}&language=en-US&format=json&apiKey=${config.twcApiKey}`)
        .then(response => response.json())
        .then(data => {return data});
        const now = await fetch(`https://api.weather.com/v3/wx/observations/current?postalKey=${itm}&language=en-US&format=json&units=e&apiKey=${config.twcApiKey}`)
        .then(response => response.json())
        .then(data => {return data});
        const sevenDay = await fetch(`https://api.weather.com/v3/wx/forecast/daily/7day?postalKey=${itm}&language=en-US&format=json&units=e&apiKey=${config.twcApiKey}`)
        .then(response => response.json())
        .then(data => {return data});
        const data = {
            "name": loc.location.displayName,
            "now": {
                "temp": now.temperature,
                "phrase": now.wxPhraseLong,
            },
            "daily": [
                {
                    "time": sevenDay.daypart[0].daypartName[0],
                    "temp": sevenDay.daypart[0].temperature[0],
                    "phrase": sevenDay.daypart[0].wxPhraseLong[0],
                },
                {
                    "time": sevenDay.daypart[0].daypartName[1],
                    "temp": sevenDay.daypart[0].temperature[1],
                    "phrase": sevenDay.daypart[0].wxPhraseLong[1],
                }
            ],
        }
        list.push(data);
        if (idx == 0) {
            primaryCityDetails = loc;
        }
        console.log('Fetched weather for ' + itm);
    }
    await fs.writeFile((__dirname, 'data/wx.json'), JSON.stringify(list));
    // fetch alerts
    const lat = primaryCityDetails.location.latitude;
    const lon = primaryCityDetails.location.longitude;
    try {
        const alerts = await fetch(`https://api.weather.com/v3/alerts/headlines?geocode=${lat},${lon}&format=json&language=en-US&apiKey=${config.twcApiKey}`)
        .then(response => response.json())
        .then(data => {return data});
        var alertsList = [];
        if (alerts.alerts != []) {
            for (let idx = 0; idx < alerts.alerts.length; idx++) {
                const itm = alerts.alerts[idx];
                if (itm.severityCode <= 2) {
                    const alertDetails = await fetch(`https://api.weather.com/v3/alerts/detail?alertId=${itm.detailKey}&format=json&language=en-US&apiKey=${config.twcApiKey}`)
                        .then(response => response.json())
                        .then(data => {return data});
                    console.log(JSON.stringify(alertDetails));
                    alertsList.push(`FROM THE ARN 4 FIRST ALERT WEATHER TEAM, ${newLineToSpace(alertDetails.alertDetail.texts[0].description)}`)
                }
            }
        } else {}
        await fs.writeFile((__dirname, 'data/wx_alerts.json'), JSON.stringify(alertsList));
    } catch (error) {
        console.error('could not fetch alert data :c')
        await fs.writeFile((__dirname, 'data/wx_alerts.json'), JSON.stringify([]));
    }
}

async function fetchStocks() {
    var list = [];
    for (let idx = 0; idx < config.weatherCities.length; idx++) {
        const itm = config.stockIndicies[idx];
        const details = await fetch(`https://query2.finance.yahoo.com/v8/finance/chart/${itm}`)
        .then(response => response.json())
        .then(data => {return data.chart.result[0].meta});
        var oneDayReturn
        if (details.regularMarketPrice >= details.previousClose) {
            oneDayReturn = "▲"
        } else {
            oneDayReturn = "▼"
        }
        const data = {
            "name": details.longName,
            "oneDayReturn": oneDayReturn,
            "change": Math.round((Math.abs(details.regularMarketPrice - details.previousClose)) * 100) / 100,
        }
        list.push(data);
        console.log('Fetched stock info for ' + itm)
    }
    fs.writeFile((__dirname, 'data/stock.json'), JSON.stringify(list));
}

async function fetchSports() {
    var list = [];
    for (let idx = 0; idx < config.sportLeagues.length; idx++) {
        const itm = config.sportLeagues[idx];
        const details = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${itm}/scoreboard`)
        .then(response => response.json())
        .then(data => {return data});
        for (let imx = 0; imx < details.events.length; imx++) {
            const idm = details.events[imx];
            const data = {
                "league": details.leagues[0].abbreviation,
                "home_name": idm.competitions[0].competitors[0].team.name,
                "home_score": idm.competitions[0].competitors[0].score,
                "away_name": idm.competitions[0].competitors[1].team.name,
                "away_score": idm.competitions[0].competitors[1].score,
                "time": idm.competitions[0].status.type.shortDetail
            };
            list.push(data);
        }
        console.log('Fetched games from ' + itm)
    }
    fs.writeFile((__dirname, 'data/sport.json'), JSON.stringify(list));
}

setInterval(() => {
    fetchFeed();
    fetchWeather();
    fetchStocks();
    fetchSports();
}, config.fetchInterval * 60000);

fetchFeed();
fetchWeather();
fetchStocks();
fetchSports();