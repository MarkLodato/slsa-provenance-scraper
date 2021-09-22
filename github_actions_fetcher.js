const octokit = require('@octokit/request');

async function main(params) {
  const data = await fetch_run(params);
  const provenance = build_provenance(data);
  console.log(provenance);
}

async function fetch_run(params) {
  const request = octokit.request.defaults({
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

  return {
    'run': run.data,
    'workflow': workflow.data,
    'jobs': jobs.data,
    'artifacts': artifacts.data,
  };
}

function build_provenance(data) {
  return {
    '_type': 'https://in-toto.io/Statement/v0.1',
    // TODO 'subject': {}
    'predicateType': 'https://slsa.dev/provenance/v0.1',
    'predicate': {
      'builder': {
        // We can only call it "self-hosted" if all jobs were self-hosted, but
        // that information is not avilable to us.
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

Promise.resolve(main({
  owner: 'slsa-framework',
  repo: 'github-actions-demo',
  run_id: 1241960989,
}));
