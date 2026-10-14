const ISSUE_MARKER = '<!-- cwv-monitor:daily-report -->';
const ISSUE_TITLE = 'Informe diario de Core Web Vitals';

export async function publishGithubReport(settings, markdown, fetchImpl = fetch) {
  if (!settings?.token || !/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(settings.repository ?? '')) {
    throw new Error('La publicacion requiere GITHUB_TOKEN y GITHUB_REPOSITORY validos.');
  }
  const repositoryPath = settings.repository.split('/').map(encodeURIComponent).join('/');
  const baseUrl = `https://api.github.com/repos/${repositoryPath}/issues`;

  async function request(url, method = 'GET', body) {
    const response = await fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${settings.token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`GitHub respondio HTTP ${response.status}; comprueba que Issues esta habilitado y que Actions tiene permiso issues: write.`);
    }
    return response.json();
  }

  let issue;
  if (settings.issueNumber) {
    if (!Number.isInteger(settings.issueNumber) || settings.issueNumber < 1) {
      throw new Error('REPORT_ISSUE_NUMBER debe ser un entero positivo.');
    }
    issue = await request(`${baseUrl}/${settings.issueNumber}`);
    if (issue.pull_request) throw new Error('REPORT_ISSUE_NUMBER debe apuntar a una issue, no a una pull request.');
  } else {
    for (let page = 1; ; page++) {
      const issues = await request(`${baseUrl}?state=all&per_page=100&page=${page}`);
      if (!Array.isArray(issues)) throw new Error('GitHub no devolvio una lista valida de issues.');
      issue = issues.find((entry) => !entry.pull_request && entry.body?.includes(ISSUE_MARKER));
      if (issue || issues.length < 100) break;
    }
    if (!issue) {
      issue = await request(baseUrl, 'POST', {
        title: ISSUE_TITLE,
        body: `${ISSUE_MARKER}\n\nInformes diarios publicados por GitHub Actions. Suscribete a esta issue para recibir las actualizaciones segun tus preferencias de notificaciones de GitHub.`,
      });
    }
  }

  if (issue.state === 'closed') {
    issue = await request(`${baseUrl}/${issue.number}`, 'PATCH', { state: 'open' });
  }
  const comment = await request(`${baseUrl}/${issue.number}/comments`, 'POST', { body: markdown });
  return comment.html_url ?? issue.html_url;
}