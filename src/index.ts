import fs from "fs";
import path from "path";

import fetch from "node-fetch";
import yaml from "js-yaml";
import * as dateFns from "date-fns";

const endpoint = "https://api.github.com/graphql";
const authToken = process.env["GITHUB_TOKEN"];

if (!authToken) {
    throw new Error("GITHUB_TOKEN is not exists");
}

type Settings = {
    author: string;
    startDay?: string;
    ignoreOrganizations?: string[];
};

const settings: Settings = yaml.safeLoad(fs.readFileSync(path.join(process.cwd(), "settings.yaml"), { encoding: "utf8" }));

const author = settings.author;
if (!author) {
    throw new Error("author is not exists");
}
const ignoreOrgs = settings.ignoreOrganizations || [];

let start: Date;
let end: Date;
{
    const dayIndices = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map(v => v.toLowerCase());
    let day = dayIndices.indexOf((settings.startDay || dayIndices[0]).toLowerCase());
    if (day === -1) {
        day = 0;
    }
    end = new Date();
    end = dateFns.setDay(end, day);
    end = dateFns.setHours(end, 0);
    end = dateFns.setMinutes(end, 0);
    end = dateFns.setSeconds(end, 0);
    end = dateFns.setMilliseconds(end, 0);
    end = dateFns.setHours(end, 0);
    if (Date.now() < end.getTime()) {
        end = dateFns.addDays(end, -7);
    }

    start = dateFns.addDays(end, -7);
    end = dateFns.addMilliseconds(end, -1);
}
console.log("start", dateFns.format(start, "yyyy-MM-dd'T'HH:mm:ss.SSSxxx"));
console.log("end", dateFns.format(end, "yyyy-MM-dd'T'HH:mm:ss.SSSxxx"));
console.log();

// https://developer.github.com/v4/explorer/
const query = `
{
    search(first: 100, query: "author:${author}", type: ISSUE) {
      nodes {
        __typename
        ... on Issue {
          id
          number
          title
          body
          createdAt
          closed
          closedAt
          url
          repository {
            owner {
              id
              login
            }
            name
          }
        }
        ... on PullRequest {
          id
          number
          title
          body
          createdAt
          closed
          closedAt
          url
          repository {
            owner {
              id
              login
            }
            name
          }
        }
      }
    }
  }
`

async function exec() {
    const resp = await fetch(endpoint, {
        method: "POST",
        headers: {
            Authorization: `bearer ${authToken}`,
        },
        body: `{"query":${JSON.stringify(query)}}`,
    });
    if (resp.status !== 200) {
        throw new Error(`error, ${resp.status} ${await resp.text()}`);
    }
    const data = await resp.json();

    const text = data.data.search.nodes
        .filter((v: any) => ignoreOrgs.indexOf(v.repository.owner.login) === -1)
        .filter((v: any) => {
            const createdAt = new Date(v.createdAt);
            return start.getTime() <= createdAt.getTime() && createdAt.getTime() < end.getTime();
        })
        .map((v: any) => `* ${v.title} ${v.createdAt}\n    * ${v.url}`).join("\n");
    console.log(text);
}

exec().catch(err => console.error(err));
