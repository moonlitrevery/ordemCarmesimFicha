# Instruções para o agente: organizar a entrega do Projeto P2 (Testes e Qualidade de Software)

Você é um agente de IA com acesso ao projeto do usuário. Leia este arquivo inteiro antes de agir. Sua tarefa é **organizar os arquivos da entrega** do Projeto Integrado P2 em uma estrutura de pastas obrigatória e **informar o que está faltando**.

---

## 1. Contexto: o que é o projeto

**Disciplina:** Testes e Qualidade de Software, Ciência da Computação, UNISAGRADO, 2026.
**Professor:** Prof. Dr. Elvio Gilberto da Silva.
**Trabalho:** Projeto Integrado P2, feito em duplas ou trios ao longo do semestre. Vale de 0,0 a 10,0 e é lançado como nota da P2.

### Objetivo

O objetivo **não** é desenvolver um sistema do zero. É **planejar, executar e avaliar a qualidade de um sistema web já existente** (escolhido pelo grupo e aprovado pelo professor) por meio de testes manuais e automatizados, registro de defeitos, métricas, TDD, CI/CD e melhoria contínua. Tudo precisa ser **rastreável e baseado em evidências reais**. Dados, defeitos, métricas ou capturas inventados comprometem a nota.

### O que deve ser entregue (resumo)

1. Identificação e aprovação do sistema testado, com README.
2. Requisitos, escopo e riscos.
3. Plano de testes.
4. Catálogo de casos de teste e matriz de rastreabilidade.
5. Execução manual dos testes, com evidências.
6. Registro de defeitos (GitHub Issues ou Jira).
7. Testes automatizados: unitários, integração/API (Postman) e sistema/interface (Selenium).
8. Testes de aceitação e não funcionais.
9. Métricas e análise de qualidade (SonarQube).
10. Evolução por TDD, pipeline CI/CD e plano de melhoria contínua.
11. Relatório final (DOCX + PDF).
12. Apresentação (PPTX + PDF), roteiro de demonstração e vídeo de contingência.
13. Diário de participação.
14. Cópia de segurança da entrega.

### Quantidades mínimas exigidas

| Item | Mínimo |
|---|---|
| Requisitos no escopo | 8 (ao menos 6 funcionais e 2 não funcionais) |
| Riscos documentados | 8 |
| Casos de teste manuais | 24 |
| Execuções manuais | 24 |
| Testes unitários automatizados | 6 |
| Testes de integração/API automatizados | 5 |
| Testes de sistema/interface (Selenium) | 4 |
| Cenários de aceitação | 4 |
| Testes não funcionais | 6 (em pelo menos 3 categorias) |
| Métricas | 8 |
| Evolução por TDD | 1 (com evidências Red, Green e Refactor) |
| Pipeline CI/CD | 1 (com evidências) |
| Análise de qualidade (SonarQube) | 2 execuções (linha de base e posterior) |

---

## 2. Estrutura de pastas da entrega

### 2.1 Pasta principal do grupo

Todas as pastas abaixo devem ficar **dentro de uma única pasta, criada na raiz do projeto**, com este nome:

```
P2_TQS_2026_TURMA_GRUPOXX_NOME-DO-SISTEMA
```

Exemplo: `P2_TQS_2026_CC_GRUPO03_SISTEMA-ACADEMICO`

- Se você ainda não souber a turma, o número do grupo ou o nome do sistema, **pergunte ao usuário** antes de criar a pasta. Se ele não souber, use o padrão com os marcadores `TURMA`, `GRUPOXX` e `NOME-DO-SISTEMA` e avise que será preciso renomear depois.
- Se já existir uma pasta com esse padrão na raiz do projeto, use-a.
- Essa pasta serve apenas para o usuário saber onde está o material a entregar. A entrega oficial será feita depois, no Google Drive indicado pelo professor, com esta mesma estrutura.

### 2.2 Subpastas obrigatórias (17) e o que cada uma deve conter

#### `00_IDENTIFICACAO_E_README`
- **README** com, nesta ordem: integrantes; nome e versão do sistema; link do repositório; tecnologias; pré-requisitos; instalação; configuração; banco e dados; execução; execução dos testes; acesso ao pipeline; localização dos documentos; credenciais fictícias; problemas conhecidos; contato do grupo.
- **P01:** Ficha de identificação e aprovação do sistema (Apêndice A), com a decisão do professor.
- **Apêndice M:** Declaração final do grupo, assinada.

#### `01_SISTEMA_ALVO`
- Código-fonte completo do sistema testado (ou cópia/link do repositório), na versão informada, com dependências declaradas e instruções de execução.

#### `02_REQUISITOS_ESCOPO_RISCOS`
- **P02:** Documento de requisitos, escopo e riscos.
  - Catálogo de requisitos (Apêndice B): mínimo de 8, cada um com ID (RF-01, RNF-01...), descrição verificável, tipo, prioridade e critério de aceitação.
  - Matriz de riscos (Apêndice C): mínimo de 8, com probabilidade, impacto, prioridade e resposta/teste.
  - O que está dentro e fora do escopo.

#### `03_PLANO_DE_TESTES`
- **P03:** Plano de testes (Apêndice D). Deve conter: sistema e versão, objetivo, escopo e fora do escopo, riscos, níveis e tipos de teste, técnicas, ambiente e ferramentas, dados de teste, responsabilidades, critérios de entrada, saída e suspensão/retomada, cronograma, produtos e comunicação.

#### `04_CASOS_E_RASTREABILIDADE`
- **P04:** Catálogo de casos de teste (Apêndice E). Mínimo de 24 casos manuais (positivos, negativos, limites, alternativos e exceções), usando técnicas como particionamento de equivalência e valor limite, com indicação dos candidatos à automação.
- **P05:** Matriz de rastreabilidade (Apêndice H): requisito → risco → casos → execuções → defeitos → situação.
- Normalmente ficam em planilha (XLSX).

#### `05_EXECUCAO_MANUAL`
- **P06:** Registro de execução (Apêndice F), mínimo de 24 execuções, com resultado (Aprovado, Reprovado, Bloqueado ou Não executado).
- Evidências (capturas de tela, logs), identificadas com o ID do caso e a data.
- Retestes e regressão após correções.

#### `06_DEFEITOS`
- **P07:** Exportação dos defeitos do GitHub Issues ou Jira (PDF, CSV ou relatório consolidado).
- Cada defeito segue o Apêndice G: título, ambiente e versão, pré-condições, passos, esperado x obtido, severidade, prioridade, evidências, status, requisito e caso relacionados.
- Apenas defeitos reais.

#### `07_AUTOMACAO_UNITARIA`
- **P08 (parte 1):** código dos testes unitários (mínimo de 6; JUnit se o sistema for Java, ou framework equivalente aprovado), com comando de execução e resultado.

#### `08_INTEGRACAO_API`
- **P08 (parte 2):** testes de integração/API (mínimo de 5).
- Se houver API: **coleção e ambiente do Postman exportados em JSON**, além de evidências de execução. Ao menos um fluxo positivo e um negativo por operação crítica.

#### `09_SISTEMA_INTERFACE`
- **P08 (parte 3):** testes Selenium de fluxos ponta a ponta (mínimo de 4), com verificações reais. Capturas ou logs de falhas, se houver.

#### `10_ACEITACAO_NAO_FUNCIONAIS`
- **P09:**
  - Mínimo de 4 cenários de aceitação, com decisão (Aceito, Aceito com ressalvas ou Não aceito) e observações.
  - Mínimo de 6 testes não funcionais, em pelo menos 3 categorias (desempenho básico, usabilidade, compatibilidade, confiabilidade, segurança básica), registrados conforme o Apêndice I.

#### `11_METRICAS_E_QUALIDADE`
- **P10:** Planilha de métricas (Apêndice K) com no mínimo 8 indicadores, fonte dos dados e interpretação: percentual de execução, taxa de aprovação, taxa de reprovação, cobertura de requisitos, taxa de automação, defeitos por severidade, defeitos por status e taxa de reabertura.
- Gráficos legíveis e explicados.
- Evidências das **2 execuções do SonarQube** (linha de base e posterior), se tecnicamente compatível.

#### `12_TDD_CICD_MELHORIA`
- **P11** (Apêndice J):
  - 1 evolução por TDD, com evidências de RED, GREEN e REFACTOR e os commits relacionados.
  - 1 pipeline CI/CD: arquivo de configuração (por exemplo `.github/workflows/*.yml`), gatilho, execução com falha seguida de correção e execução aprovada.
  - Plano de melhoria contínua com prioridades, responsáveis e critérios de verificação.

#### `13_RELATORIO_FINAL`
- **P12:** Relatório final em **DOCX editável e PDF idêntico**, em português do Brasil.
- Estrutura: Capa, Folha de identificação, Sumário, 1. Introdução, 2. Caracterização do sistema, 3. Escopo, requisitos e riscos, 4. Planejamento dos testes, 5. Especificação dos casos, 6. Execução manual e defeitos, 7. Automação, 8. Integração e sistema, 9. Aceitação e não funcionais, 10. Métricas e indicadores, 11. TDD, CI/CD e melhoria contínua, 12. Discussão dos resultados, 13. Conclusão, Referências, Apêndices e anexos.

#### `14_APRESENTACAO_E_VIDEO_CONTINGENCIA`
- **P13:** Apresentação em **PPTX e PDF** e roteiro de demonstração.
- Vídeo de contingência (MP4 ou arquivo com link acessível) com demonstração curta dos principais testes.

#### `15_DIARIO_DE_PARTICIPACAO`
- **P14:** Diário de participação (Apêndice L): data, atividade, responsável principal, colaboradores, tempo e evidência.

#### `16_BACKUP_ENTREGA`
- Cópia de segurança de toda a entrega.

### 2.3 Item extra

- **`COMPROVANTE_DE_ENTREGA.pdf`**, com data, hora, integrantes e checklist assinado digitalmente. O documento da disciplina não define a pasta. Se o arquivo existir, copie-o para a raiz da pasta do grupo e avise o usuário para confirmar com o professor.

### 2.4 Formatos exigidos

| Conteúdo | Formato |
|---|---|
| Relatório final | DOCX + PDF idêntico |
| Planilhas | XLSX (ou equivalente editável) |
| Código e testes | Arquivos-fonte, dependências declaradas e link do repositório |
| Postman | Coleção e ambiente em JSON + evidências |
| Defeitos | PDF/CSV ou relatório consolidado |
| Apresentação | PPTX + PDF |
| Vídeo de contingência | MP4 ou link acessível |

---

## 3. O que você deve fazer, passo a passo

### Passo 1: criar a estrutura
- Crie a pasta principal do grupo (seção 2.1) na raiz do projeto, se ainda não existir.
- Dentro dela, crie as 17 subpastas da seção 2.2 **que ainda não existirem**, com exatamente esses nomes.
- Se alguma pasta já existir, não a recrie nem apague nada dela.

### Passo 2: analisar as pastas e o projeto
- Verifique primeiro o conteúdo das subpastas que já existem (pode já haver arquivos nelas).
- Em seguida, varra o restante do projeto (código, testes, documentos, planilhas, PDFs, coleções Postman, arquivos de pipeline, relatórios do SonarQube, capturas de tela, vídeos, apresentações etc.) procurando arquivos que correspondam ao que cada pasta pede.
- Pistas comuns para localizar o material:
  - testes unitários: pastas como `src/test`, `tests`, `__tests__`, arquivos `*Test.java`, `*.test.js`, `test_*.py`;
  - testes Selenium: arquivos que usam `selenium` / `WebDriver`;
  - Postman: arquivos `*.postman_collection.json` e `*.postman_environment.json`;
  - pipeline: `.github/workflows/*.yml`, `.gitlab-ci.yml`, `Jenkinsfile`;
  - SonarQube: `sonar-project.properties`, relatórios e capturas;
  - documentos: `.docx`, `.pdf`, `.xlsx`, `.csv`, `.pptx`, `.md`;
  - evidências: imagens (`.png`, `.jpg`), logs e vídeos (`.mp4`);
  - README, código-fonte do sistema e arquivos de dependências (`pom.xml`, `package.json`, `requirements.txt`).
- Quando houver dúvida sobre a qual pasta um arquivo pertence, **pergunte ao usuário** em vez de adivinhar.

### Passo 3: copiar os arquivos (nunca mover)
- **Copie** os arquivos encontrados para a subpasta correta, mantendo os originais onde estão.
- **Nunca** remova, mova, renomeie, edite ou sobrescreva arquivos nos locais de origem.
- Se um arquivo já estiver dentro da subpasta correta, deixe-o lá.
- Se já existir na subpasta de destino um arquivo com o mesmo nome, **não sobrescreva**. Mantenha o existente e avise o usuário.
- Para o código-fonte do sistema (`01_SISTEMA_ALVO`) e para os testes automatizados, copie apenas os arquivos relevantes. **Não copie** pastas geradas ou pesadas como `node_modules`, `target`, `build`, `dist`, `.venv`, `__pycache__`. O repositório `.git` também não deve ser copiado. Para o `.git`, registre apenas o link do repositório.
- Se um mesmo arquivo servir a duas pastas (por exemplo, uma planilha que tem casos e execuções), pode copiá-lo para as duas, e mencione isso no relatório final.
- Não crie conteúdo falso para preencher pastas. **Não invente** defeitos, evidências, métricas, capturas nem resultados de execução. Se não existir, a pasta fica pendente.

### Passo 4: verificar o que está faltando
Depois de copiar, avalie cada subpasta e classifique-a como **COMPLETA** ou **INCOMPLETA** comparando o conteúdo com a seção 2.2 e com as quantidades mínimas da seção 1.

- Para cada pasta **incompleta**, liste exatamente o que falta. Exemplos: "faltam 2 testes Selenium para chegar ao mínimo de 4", "a coleção Postman não foi exportada em JSON", "não há evidência da segunda execução do SonarQube", "falta o PDF do relatório final".
- Itens que **não existem como arquivo no projeto** (issues no GitHub/Jira, execução do pipeline, aprovação do professor, assinaturas, vídeo) devem ser listados como pendências para o usuário exportar ou providenciar.
- Se você não conseguir contar ou verificar algo (por exemplo, o número de casos dentro de uma planilha), diga o que verificou e o que o usuário precisa conferir manualmente.

### Passo 5: relatório final ao usuário
Termine com um relatório neste formato:

```
RELATÓRIO DA ORGANIZAÇÃO DA ENTREGA

Pasta principal: <nome da pasta>
Pastas criadas agora: <lista>
Arquivos copiados: <resumo por pasta>
Conflitos (arquivos já existentes não sobrescritos): <lista ou "nenhum">

STATUS POR PASTA
00_IDENTIFICACAO_E_README: COMPLETA / INCOMPLETA - <o que falta>
01_SISTEMA_ALVO: COMPLETA / INCOMPLETA - <o que falta>
... (todas as 17 pastas, mais o COMPROVANTE_DE_ENTREGA)

PENDÊNCIAS PARA O USUÁRIO
1. <item> (pasta X)
2. <item> (pasta Y)
```

- **Se alguma pasta estiver incompleta:** apresente a lista de pendências, de forma clara, pasta por pasta, com o que falta em cada uma. Diga que o usuário pode chamar você novamente depois de completar os itens, e que nessa nova execução você só precisa reanalisar as pastas pendentes.
- **Se todas as pastas estiverem completas:** informe claramente que **o projeto está pronto para entrega**, lembrando que ainda é preciso fazer o upload na pasta do Google Drive do professor e seguir a checklist final abaixo.

---

## 4. Lembretes finais para repassar ao usuário

- A entrega oficial é **somente** na pasta do Google Drive do professor, com a mesma estrutura e o mesmo nome de pasta. Não criar outra pasta nem enviar outro link sem autorização.
- Testar todos os links (repositório, issues, pipeline, vídeo) em janela anônima, e garantir que o professor tenha permissão de visualização e download sem precisar pedir acesso.
- Nenhum arquivo pode estar vazio ou corrompido.
- Não pode haver senhas reais, dados pessoais ou informações confidenciais nos arquivos. Use somente dados fictícios.
- Não modificar os arquivos depois do horário limite da P2.
- O sistema testado precisa ter sido aprovado pelo professor (Apêndice A).
- Na apresentação (12 a 15 minutos mais até 5 de perguntas), todos os integrantes falam e respondem.
