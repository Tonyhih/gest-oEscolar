// Teste de ponta a ponta no browser (Playwright): percorre os fluxos principais com vários perfis.
// Pré-requisitos: API em memória (cd api && npm run dev:memoria), front-end compilado e servido
// (npm run build && npm run preview) e o Playwright (npm i -D playwright && npx playwright install chromium).
// Uso: npm run e2e   (os dados mudam: reinicie a API em memória antes de repetir)
const { chromium } = require('playwright');
const OUT = process.env.CAPTURAS ?? require('path').join(__dirname, 'capturas');
require('fs').mkdirSync(OUT, { recursive: true });
const URL = process.env.WEB_URL ?? 'http://localhost:4173/';
const PW = 'Teste#2026';
const erros = [];
const passos = [];
const ok = (m) => { passos.push('OK  ' + m); console.log('OK  ' + m); };

async function novaPagina(browser, opcoes = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true, ...opcoes });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') erros.push(`[consola] ${m.text()}`); });
  page.on('pageerror', (e) => erros.push(`[página] ${e.message}`));
  return page;
}
async function entrar(page, email) {
  await page.goto(URL);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Palavra-passe').fill(PW);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('heading', { name: /Olá/ }).waitFor();
}

(async () => {
  const browser = await chromium.launch();
  try {
    // 1. Login errado e login da secretaria
    let p = await novaPagina(browser);
    await p.goto(URL);
    await p.getByLabel('Email').fill('secretaria@lda101.test');
    await p.getByLabel('Palavra-passe').fill('errada');
    await p.getByRole('button', { name: 'Entrar' }).click();
    await p.getByText('Email ou palavra-passe incorrectos.').waitFor();
    ok('login errado mostra a mensagem genérica');
    await p.screenshot({ path: `${OUT}/01-login.png` });
    await entrar(p, 'secretaria@lda101.test');
    ok('secretaria entra');
    await p.getByRole('link', { name: 'Alunos', exact: true }).click();
    await p.getByPlaceholder('Pesquisar').fill('Graça');
    await p.getByText('Graça Lukeny').waitFor();
    ok('pesquisa de alunos');
    await p.getByText('Graça Lukeny').click();
    await p.getByText('Encarregados de educação').waitFor();
    await p.getByText('Joana Lukeny').waitFor();
    ok('ficha do aluno com encarregado e matrícula');
    await p.screenshot({ path: `${OUT}/02-aluno.png`, fullPage: true });
    await p.close();

    // 2. Professora Lurdes lança notas de LP na 7.ª A (1.º trimestre aberto)
    p = await novaPagina(browser);
    await entrar(p, 'lurdes@lda101.test');
    await p.getByRole('link', { name: /7\.ª A/ }).first().click();
    await p.getByText('As minhas disciplinas nesta turma').waitFor();
    await p.locator('li', { hasText: 'LP' }).getByRole('link', { name: 'Notas' }).click();
    await p.getByRole('heading', { name: 'Notas de LP' }).waitFor();
    const mac = p.getByLabel('MAC de Graça Lukeny');
    await mac.fill('12,5');
    await p.getByLabel('NPP de Graça Lukeny').fill('14');
    await p.getByLabel('NPT de Graça Lukeny').fill('11');
    await p.getByLabel('NPT de Isabel Ndala').fill('25');
    if (!(await p.getByRole('button', { name: 'Gravar notas' }).isDisabled())) throw new Error('Gravar devia estar desactivado com nota 25');
    ok('nota acima da escala bloqueia a gravação');
    await p.getByLabel('NPT de Isabel Ndala').fill('12');
    await p.getByRole('button', { name: 'Gravar notas' }).click();
    await p.getByText('Notas gravadas.').waitFor();
    const mt = await p.locator('tr', { hasText: 'Graça Lukeny' }).locator('td').nth(4).innerText();
    if (mt.trim() !== '12,5') throw new Error(`MT esperada 12,5, obtida ${mt}`);
    ok('professora grava notas; MT 12,5 calculada pelo servidor');
    await p.screenshot({ path: `${OUT}/03-notas-professor.png`, fullPage: true });
    // trimestre 2 fechado
    await p.getByText('2.º trimestre').click();
    await p.getByText('Este trimestre está fechado para lançamento.').waitFor();
    ok('2.º trimestre aparece fechado');
    await p.close();

    // 3. Director de turma (Adão) publica o 1.º trimestre e vê a pauta final
    p = await novaPagina(browser);
    await entrar(p, 'adao@lda101.test');
    await p.getByRole('link', { name: /7\.ª A/ }).first().click();
    await p.getByRole('link', { name: 'Pautas' }).click();
    await p.getByRole('heading', { name: /Pauta final/ }).waitFor();
    const linhaIsabel = p.locator('tr', { hasText: 'Isabel Ndala' });
    await linhaIsabel.getByText('Não transita').waitFor();
    await p.locator('tr', { hasText: 'Hélder Cassoma' }).getByText('Transita').waitFor();
    ok('pauta final com situação de transição');
    await p.screenshot({ path: `${OUT}/04-pauta-final.png`, fullPage: true });
    await p.locator('label', { hasText: '1.º T' }).click();
    p.once('dialog', (d) => d.accept());
    await p.getByRole('button', { name: 'Publicar trimestre' }).click();
    await p.getByText('Trimestre publicado.').waitFor();
    ok('director de turma publica o 1.º trimestre');
    // faltas da turma (DT)
    await p.goto(p.url().replace(/pautas$/, 'faltas'));
    await p.getByRole('heading', { name: 'Resumo do trimestre' }).waitFor();
    await p.getByText('Faltas por justificar').waitFor();
    ok('director de turma vê o resumo e as faltas por justificar');
    // registar faltas de MAT
    await p.getByLabel('Disciplina').selectOption({ label: 'MAT' });
    await p.locator('label', { hasText: 'Joaquim Muteka' }).locator('input').check();
    await p.getByRole('button', { name: /Gravar \(1 falta\)/ }).click();
    await p.getByText(/Faltas de .* gravadas/).waitFor();
    ok('professor regista uma falta');
    await p.screenshot({ path: `${OUT}/05-faltas.png`, fullPage: true });
    await p.close();

    // 4. Director: exportar CSV e auditoria
    p = await novaPagina(browser);
    await entrar(p, 'director@lda101.test');
    await p.getByRole('link', { name: 'Turmas', exact: true }).click();
    await p.getByRole('link', { name: /7\.ª A/ }).click();
    await p.getByRole('link', { name: 'Pautas' }).click();
    await p.getByRole('heading', { name: /Pauta final/ }).waitFor();
    const [download] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Exportar CSV' }).click()]);
    const csv = require('fs').readFileSync(await download.path(), 'utf8');
    if (!csv.includes('Isabel Ndala')) throw new Error('CSV sem dados');
    ok(`director exporta a pauta em CSV (${download.suggestedFilename()})`);
    await p.getByRole('link', { name: 'Auditoria' }).click();
    await p.getByText('Publicação').first().waitFor();
    ok('auditoria mostra a publicação e a exportação');
    await p.screenshot({ path: `${OUT}/06-auditoria.png`, fullPage: true });
    await p.getByRole('link', { name: 'Configuração' }).click();
    await p.getByText('2026/2027').waitFor();
    await p.getByRole('tab', { name: 'Classes e avaliação' }).click();
    await p.getByText('Classe de exame').first().waitFor();
    ok('configuração: ano lectivo e regras das classes');
    await p.screenshot({ path: `${OUT}/07-configuracao.png`, fullPage: true });
    await p.close();

    // 5. Administração da plataforma
    p = await novaPagina(browser);
    await entrar(p, 'admin@plataforma.test');
    await p.getByRole('link', { name: 'Escolas' }).first().click();
    await p.getByText('Instituto Médio Técnico Fictício do Huambo').waitFor();
    ok('administrador vê as escolas');
    await p.close();

    // 5b. Secretaria: ficha de matrícula e importação de uma lista de teste
    p = await novaPagina(browser);
    await entrar(p, 'secretaria@lda101.test');
    await p.getByRole('link', { name: 'Matrículas' }).first().click();
    await p.getByLabel('Nome completo').fill('Kiala Novo');
    await p.getByLabel('Data de nascimento').fill('2013-04-04');
    await p.locator('#m-ee-nome').fill('Maria Novo');
    await p.locator('#m-ee-tel').fill('+244 923 111 222');
    await p.locator('#m-turma').selectOption(await p.locator('#m-turma option', { hasText: '7.ª A' }).getAttribute('value'));
    await p.getByRole('button', { name: 'Matricular' }).click();
    await p.getByText(/Kiala Novo\s*matriculado\(a\) na 7\.ª A/).waitFor();
    ok('secretaria matricula um aluno novo com encarregado numa só ficha');
    await p.getByRole('tab', { name: 'Importar lista' }).click();
    await p.locator('#i-turma').selectOption(await p.locator('#i-turma option', { hasText: '9.ª A' }).getAttribute('value'));
    await p.getByRole('button', { name: 'Preencher com 10 alunos de teste' }).click();
    await p.getByRole('button', { name: 'Importar 10 alunos' }).click();
    await p.getByText('10 alunos importados e matriculados na 9.ª A.').waitFor();
    ok('secretaria importa 10 alunos de teste para uma turma');
    await p.screenshot({ path: `${OUT}/12-importar.png`, fullPage: true });
    await p.getByRole('tab', { name: 'Matrículas do ano' }).click();
    await p.getByText('Adelino Chipenda (teste)').waitFor();
    ok('lista de matrículas do ano mostra os importados');
    await p.close();

    // 5c. Documentos em PDF: mini-pauta (professor), pauta (director), termo e certificado (secretaria)
    const ehPdf = async (download) => require('fs').readFileSync(await download.path()).subarray(0, 5).toString() === '%PDF-';
    p = await novaPagina(browser);
    await entrar(p, 'adao@lda101.test');
    await p.getByRole('link', { name: /7\.ª A/ }).first().click();
    await p.locator('li', { hasText: 'MAT' }).getByRole('link', { name: 'Notas' }).click();
    let [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Mini-pauta (PDF)' }).click()]);
    if (!(await ehPdf(dl))) throw new Error('Mini-pauta não é um PDF');
    ok(`professor descarrega a mini-pauta (${dl.suggestedFilename()})`);
    await p.close();

    p = await novaPagina(browser);
    await entrar(p, 'director@lda101.test');
    await p.getByRole('link', { name: 'Turmas', exact: true }).click();
    await p.getByRole('link', { name: /9\.ª A/ }).click();
    await p.getByRole('link', { name: 'Pautas' }).click();
    await p.getByRole('heading', { name: /Pauta final/ }).waitFor();
    [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'PDF', exact: true }).click()]);
    if (!(await ehPdf(dl))) throw new Error('Pauta não é um PDF');
    ok(`director descarrega a pauta final (${dl.suggestedFilename()})`);
    await p.close();

    p = await novaPagina(browser);
    await entrar(p, 'secretaria@lda101.test');
    await p.getByRole('link', { name: 'Alunos', exact: true }).click();
    await p.getByPlaceholder('Pesquisar').fill('Manuel');
    await p.getByText('Manuel Chissola').click();
    await p.getByText('Termo de frequência e aproveitamento').waitFor();
    [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Descarregar PDF' }).click()]);
    if (!(await ehPdf(dl))) throw new Error('Termo não é um PDF');
    ok('secretaria descarrega o termo de frequência e aproveitamento');
    await p.getByRole('button', { name: 'Verificar dados' }).click();
    await p.getByText(/Tudo pronto\. Média final: 12 valores/).waitFor();
    await p.getByLabel('Livro de registo n.º').fill('7');
    p.once('dialog', (d) => d.accept());
    [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Emitir certificado' }).click()]);
    if (!(await ehPdf(dl))) throw new Error('Certificado não é um PDF');
    await p.getByText(/Certificado n\.º 1\/\d{4}/).waitFor();
    ok(`secretaria emite o certificado do I Ciclo (${dl.suggestedFilename()})`);
    await p.screenshot({ path: `${OUT}/13-documentos.png`, fullPage: true });
    await p.close();

    // 6. Painel do director e estágios (13.ª classe)
    p = await novaPagina(browser);
    await entrar(p, 'director@lda101.test');
    await p.getByRole('link', { name: 'Painel' }).first().click();
    await p.getByText('Alunos que transitam, por classe').waitFor();
    await p.getByRole('img', { name: '7.ª classe: 60 % transitam' }).waitFor();
    ok('painel do director com a transição por classe');
    await p.screenshot({ path: `${OUT}/10-painel.png`, fullPage: true });
    await p.close();

    p = await novaPagina(browser);
    await entrar(p, 'coordenador@hbo201.test');
    await p.getByRole('link', { name: 'Estágios' }).click();
    const cartao = p.locator('.card', { hasText: 'Albertina Sakaita' });
    await cartao.getByText('Por concluir').waitFor();
    await cartao.getByRole('button', { name: 'Actualizar' }).click();
    await p.getByLabel('Nota do estágio').fill('13');
    await p.getByLabel('Tema').fill('Rede da escola');
    await p.getByLabel('Data da defesa').fill('2027-06-21');
    await p.getByLabel('Nota da defesa').fill('14,5');
    await p.getByRole('button', { name: 'Gravar' }).click();
    await p.getByText('Estágio de Albertina Sakaita gravado.').waitFor();
    await cartao.getByText('Curso concluído').waitFor();
    ok('coordenação lança estágio e TFC; curso concluído');
    await p.screenshot({ path: `${OUT}/11-estagios.png`, fullPage: true });
    await p.close();

    // 7. Telemóvel (360 px): professora a lançar notas
    p = await novaPagina(browser, { viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await entrar(p, 'marta@hbo201.test');
    await p.screenshot({ path: `${OUT}/08-telemovel-inicio.png` });
    await p.getByRole('link', { name: /10\.ª A/ }).first().click();
    await p.locator('li', { hasText: 'PROG' }).getByRole('link', { name: 'Notas' }).click();
    await p.getByRole('heading', { name: 'Notas de PROG' }).waitFor();
    const larg = await p.evaluate(() => document.documentElement.scrollWidth);
    if (larg > 360) throw new Error(`A página tem scroll horizontal: ${larg}px`);
    ok('telemóvel: grelha de notas sem scroll horizontal da página');
    await p.screenshot({ path: `${OUT}/09-telemovel-notas.png`, fullPage: true });
    await p.close();
  } catch (e) {
    erros.push(`[teste] ${e.message}`);
    console.log('FALHOU:', e.message);
  } finally {
    await browser.close();
    console.log(`\n${passos.length} passos OK`);
    console.log(erros.length ? `ERROS:\n${erros.join('\n')}` : 'Sem erros na consola.');
  }
})().then(() => { if (erros.some((e) => !e.includes("401"))) process.exitCode = 1; });
