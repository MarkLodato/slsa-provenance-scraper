# SLSA Provenance Scraper

This is a little program to generate SLSA provenance from CI build logs.

WORK IN PROGRESS - NOT YET WORKING

## Instructions

1.  Create a new GitHub
    [Personal Access Token](https://github.com/settings/tokens/new) (PAT)
    with the `workflow` scope. This is needed to fetch artifacts.


2.  Save the PAT to your ~/.netrc as a password for `api.github.com`:

    ```none
    machine api.github.com
    login ...
    password ghp_...
    ```

2.  Install NPM dependencies:

    ```bash
    $ npm ci
    ```

3.  Run the script:

    ```bash
    $ node --unhandled-rejections=strict src/fetchers/github_actions.js
    ```
