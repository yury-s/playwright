/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { MarkdownReporter } from 'playwright/lib/internalsForTest';
import github from '@actions/github';
import core from '@actions/core';

import type { MetadataWithCommitInfo } from 'playwright/src/isomorphic/types';

class GHAMarkdownReporter extends MarkdownReporter {
  // declare config: FullConfig;

  async publishReport(report: string) {
    console.log('Publishing report to PR ' + report);
    const metadata = this.config.metadata as MetadataWithCommitInfo;
    const prHref = metadata.ci?.prHref;
    const prNumber = parseInt(prHref?.split('/').pop(), 10);
    if (!prNumber) {
      console.log('No PR number found, skipping GHA comment. prHref:', prHref);
      return;
    }
    core.info('Posting comment to PR ' + prHref);

    const token = core.getInput('github-token');
    const octokit = github.getOctokit(token);
    const context = github.context;

    const reportUrl = process.env.HTML_REPORT_URL;
    const mergeWorkflowUrl = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;

    const { data: response } = await octokit.rest.issues.createComment({
      ...context.repo,
      issue_number: prNumber,
      body: formatComment([
        `### [Test results](${reportUrl}) for "${github.context.payload.workflow_run?.name}"`,
        report,
        '',
        `Merge [workflow run](${mergeWorkflowUrl}).`
      ]),
    });
    core.info('Posted comment: ' + response.html_url);
  }
}

function formatComment(lines) {
  let body = lines.join('\n');
  if (body.length > 65535)
    body = body.substring(0, 65000) + `... ${body.length - 65000} more characters`;
  return body;
}

export default GHAMarkdownReporter;
