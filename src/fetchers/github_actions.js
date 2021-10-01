const {Buffer} = require('buffer');
const crypto = require('crypto')
const netrc = require('netrc');
const octokit = require('@octokit/request');
const {unzipRaw} = require('unzipit');

exports.regexp = new RegExp('^https?://github.com/([^/]+)/([^/]+)/actions/runs/(\\d+)$');

exports.run = async function(match) {
  const params = {
    owner: match[1],
    repo: match[2],
    run_id: match[3],
  };
  const data = await fetch_run(params);
  return build_provenance(data);
}

async function fetch_run(params) {
  const entry = netrc()['api.github.com'];
  if (!entry || !entry.password) {
    throw new Error('Missing password for `api.github.com` in ~/.netrc')
  }
  if (!entry.password.startsWith('ghp_')) {
    throw new Error('Password must be a personal access token ("ghp_...") for `api.github.com` in ~/.netrc')
  }

  const request = octokit.request.defaults({
    headers: {
      authorization: 'token ' + entry.password,
    },
    owner: params.owner,
    repo: params.repo,
  });

  const run = await request({
    url: '/repos/{owner}/{repo}/actions/runs/{run_id}',
    run_id: params.run_id,
  });

  const workflow = await request({
    url: '/repos/{owner}/{repo}/actions/workflows/{workflow_id}',
    workflow_id: run.data.workflow_id,
  });

  const jobs = await request({
    url: '/repos/{owner}/{repo}/actions/runs/{run_id}/jobs',
    run_id: params.run_id,
  });

  const artifacts = await request({
    url: '/repos/{owner}/{repo}/actions/runs/{run_id}/artifacts',
    run_id: params.run_id,
  });

  const subject = await fetch_subject(request, artifacts.data);

  return {
    run: run.data,
    workflow: workflow.data,
    jobs: jobs.data,
    artifacts: artifacts.data,
    subject: subject,
  };
}

async function fetch_subject(request, artifacts) {
  const subject = [];
  let warned = false;
  if (!artifacts.artifacts) {
    console.warn('No artifacts found in run');
  }
  for (const artifact of artifacts.artifacts) {
    if (artifact.expired) {
      if (!warned) {
        console.warn('Artifacts expired on %s', artifact.expires_at);
        warned = true;
      }
      continue;
    }
    const response = await request({
      url: '/repos/{owner}/{repo}/actions/artifacts/{artifact_id}/zip',
      artifact_id: artifact.id
    });
    const {entries} = await unzipRaw(response.data);
    for (const entry of entries) {
      if (entry.isDirectory) {
        continue;
      }
      subject.push({
        name: `${artifact.name}/${entry.name}`,
        digest: {
          sha256: sha256hex(await entry.arrayBuffer())
        },
      });
    }
  }
  subject.sort((a, b) => (a.name > b.name ? 1 : -1));
  return subject;
}

function build_provenance(data) {
  if (!data.subject) {
    console.error('No subject available so attestation is invalid')
    return null;
  }
  return {
    '_type': 'https://in-toto.io/Statement/v0.1',
    'subject': data.subject,
    'predicateType': 'https://slsa.dev/provenance/v0.1',
    'predicate': {
      'builder': {
        // TODO: Check if it is GitHub-hosted or self-hosted. The only way I
        // know how to do this is to download every job's log file and require
        // that every one has a first line indicating that it's GitHub-hosted.
        'id': 'https://attestations.github.com/actions-workflow/unknown-runner@v1',
      },
      'recipe': {
        'type': 'https://slsa.github.com/workflow@v1',
        'definedInMaterial': 0,
        // TODO: Update the spec to match this format. This code does
        // `.github/workflows/{workflow}`, while the spec says
        // `{workflow}:{job}`. We can't tell which job wrote which artifact, so
        // dropping job is a good idea, and including `.github/workflows/` makes
        // it easier to understand.
        'entryPoint': data.workflow.path,
        // Omit 'arguments'. Either:
        // - The event was 'workflow_dispatch': There may have been arguments
        //   (`input`) but we have no way of knowing.
        // - Otherwise: No arguments possible, thus omit.
        // Omit 'environment'. We don't have enough information.
      },
      'metadata': {
        'buildInvocationId': data.run.html_url,
        'buildStartedOn': data.run.created_at,
        'buildFinishedOn': data.run.updated_at,
        'completeness': {
          'arguments': (data.run.event == 'workflow_dispatch'),
          'environment': false,
          'materials': false,
        }
      },
      'materials': [{
        'uri': `git+${data.run.repository.html_url}@${data.run.head_branch}`,
        'digest': {
          'sha1': data.run.head_sha,
        },
      }],
    },
  };
}

function sha256hex(arrayBuffer) {
  const hash = crypto.createHash('sha256');
  hash.update(Buffer.from(arrayBuffer));
  return hash.digest('hex');
}
