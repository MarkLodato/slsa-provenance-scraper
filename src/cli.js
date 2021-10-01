const github_actions = require('./fetchers/github_actions.js');

const USAGE = `USAGE: cli.js <ci-uri>

Supported CI URLs:
    https://github.com/<org>/<repo>/actions/runs/<number>
`;

const FETCHERS = [
    github_actions,
];

async function main() {
  if (process.argv.length != 3) {
    console.error(USAGE);
    process.exit(1);
  }
  const uri = process.argv[2];
  let provenance = null;
  for (const fetcher of FETCHERS) {
    const match = uri.match(fetcher.regexp);
    if (match !== null) {
      provenance = await fetcher.run(match);
      break;
    }
  }
  if (provenance !== null) {
    console.log(provenance);
  } else {
    console.error('Unrecognized URI: %s', uri);
  }
}

Promise.resolve(main());
