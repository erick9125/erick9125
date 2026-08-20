import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const username = process.env.GITHUB_USERNAME || "erick9125";
const token = process.env.GITHUB_TOKEN;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readmePath = path.join(root, "README.md");
const pinTheme =
  "theme=transparent&hide_border=true&title_color=2DD4BF&icon_color=38BDF8&text_color=94A3B8";

function pinCard(name) {
  const image = `https://github-readme-stats.vercel.app/api/pin/?username=${username}&repo=${encodeURIComponent(name)}&${pinTheme}`;
  return `[![${name}](${image})](https://github.com/${username}/${name})`;
}

function toRows(names) {
  const lines = [];
  for (let index = 0; index < names.length; index += 2) {
    lines.push(
      [names[index], names[index + 1]]
        .filter(Boolean)
        .map(pinCard)
        .join(" "),
    );
  }
  return lines.join("\n\n");
}

function replaceBlock(markdown, key, content) {
  const start = `<!-- START:${key} -->`;
  const end = `<!-- END:${key} -->`;
  const pattern = new RegExp(`${start}[\\s\\S]*?${end}`);
  if (!pattern.test(markdown)) {
    throw new Error(`Missing ${start} / ${end} markers in README.md`);
  }
  return markdown.replace(pattern, `${start}\n${content}\n${end}`);
}

async function githubGraphql(query, variables) {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": `${username}-readme`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const payload = await response.json();
  if (!response.ok || payload.errors) {
    throw new Error(JSON.stringify(payload.errors || payload, null, 2));
  }
  return payload.data;
}

async function githubRest(url) {
  const response = await fetch(url, {
    headers: {
      Authorization: token ? `Bearer ${token}` : undefined,
      "User-Agent": `${username}-readme`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub REST ${response.status} ${url}`);
  }
  return response.json();
}

async function pinnedRepoNames() {
  const data = await githubGraphql(
    `
      query ($login: String!) {
        user(login: $login) {
          pinnedItems(first: 6, types: REPOSITORY) {
            nodes {
              ... on Repository {
                name
              }
            }
          }
        }
      }
    `,
    { login: username },
  );
  return (data.user?.pinnedItems?.nodes ?? [])
    .map((node) => node?.name)
    .filter(Boolean);
}

async function moreRepoNames(exclude) {
  const repos = await githubRest(
    `https://api.github.com/users/${username}/repos?per_page=100&sort=updated`,
  );
  const skipped = new Set([username, ...exclude]);
  return repos
    .filter((repo) => !repo.fork && !skipped.has(repo.name))
    .slice(0, 8)
    .map((repo) => repo.name);
}

if (!token) {
  console.error("GITHUB_TOKEN is required");
  process.exit(1);
}

const pinned = await pinnedRepoNames();
const more = await moreRepoNames(pinned);
let readme = fs.readFileSync(readmePath, "utf8");
readme = replaceBlock(
  readme,
  "PINNED",
  pinned.length ? toRows(pinned) : "_Pin repositories on your GitHub profile to show them here._",
);
readme = replaceBlock(readme, "MORE", more.length ? toRows(more) : "_No other public repositories yet._");
fs.writeFileSync(readmePath, readme);
console.log(`Pinned: ${pinned.join(", ") || "(none)"}`);
console.log(`More: ${more.join(", ") || "(none)"}`);
