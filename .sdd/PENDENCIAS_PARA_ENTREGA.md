PENDÊNCIAS PARA A ENTREGA P2 — ORDEM CARMESIM FICHA

Baseado estritamente no arquivo INSTRUCOES_ORGANIZAR_ENTREGA_P2.md e no conteúdo real verificado na pasta P2_TQS_2026_TURMA_GRUPOXX_ORDEN-CARMESIM-FICHA (não inventado, não presumido).

---

STATUS GERAL: NÃO PRONTO PARA ENTREGA.
Muitas pastas estão incompletas ou vazias. Apenas 01, 03, 05 (com ressalvas), 07, 16 estão com conteúdo; várias outras estão totalmente vazias.

---

PASTA PRINCIPAL
- Nome ainda usa marcadores (TURMA, GRUPOXX, NOME-DO-SISTEMA). Precisa ser renomeada conforme turma, grupo e nome correto do sistema antes do upload (instrução 2.1).
- COMPROVANTE_DE_ENTREGA.pdf: não encontrado na raiz. Verificar se existe; se sim, copiar para a raiz da pasta do grupo e confirmar com o professor (seção 2.3).

---

00_IDENTIFICACAO_E_README — INCOMPLETA *
- README.md existe, mas não contém todos os itens obrigatórios (integrantes, versão do sistema, link do repositório, tecnologias, pré-requisitos, instalação, configuração, banco e dados, execução, execução dos testes, acesso ao pipeline, localização dos documentos, credenciais fictícias, problemas conhecidos, contato do grupo).
- P01 (Ficha de identificação e aprovação do sistema, Apêndice A): NÃO ENCONTRADO — precisa da decisão do professor.
- Apêndice M (Declaração final do grupo, assinada): NÃO ENCONTRADO.

---

01_SISTEMA_ALVO — COMPLETA (com ressalvas) *
- Código-fonte parcial copiado (src/, public/, package.json, configs). Nenhum conteúdo inventado. Não copiar node_modules/.next/.git conforme instrução.

---

02_REQUISITOS_ESCOPO_RISCOS — INCOMPLETA (VAZIA)
- P02 (Apêndice B — catálogo de requisitos): NÃO ENCONTRADO. Mínimo exigido: 8 requisitos (pelo menos 6 funcionais + 2 não funcionais), cada um com ID (RF-01, RNF-01...), descrição verificável, tipo, prioridade e critério de aceitação.
- Matriz de riscos (Apêndice C): NÃO ENCONTRADO. Mínimo exigido: 8 riscos, com probabilidade, impacto, prioridade e resposta/teste.
- Escopo (dentro/fora): NÃO ENCONTRADO.
- Atual: 0 requisitos e 0 riscos documentados.

---

03_PLANO_DE_TESTES — COMPLETA (com ressalvas)* 
- .sdd/PLAN_testes.md copiado. Verificar manualmente se todos os itens do Apêndice D estão presentes (sistema/versão, objetivo, escopo/fora, riscos, níveis/tipos, técnicas, ambiente/ferramentas, dados de teste, responsabilidades, critérios de entrada/saída/suspensão, cronograma, produtos, comunicação).

---

04_CASOS_E_RASTREABILIDADE — INCOMPLETA ** Verificar apendice
- P04 (catalogo de casos manuais): EXISTE — docs/casos-teste-manuais.md e .odt (24 casos CT-01 a CT-24), atingindo o mínimo de 24. Técnicas (particionamento, valor limite) devem ser verificadas no arquivo.
- FALTA: P05 — Matriz de rastreabilidade (Apêndice H), normalmente em planilha XLSX, ligando requisito → risco → casos → execuções → defeitos → situação.
- FALTA: indicação organizada de candidatos à automação dentro do catálogo.

---

05_EXECUCAO_MANUAL — COMPLETA (com ressalvas) *
- 24 execuções (ct-01 a ct-24) com resultado.txt e evidências (.png) existem.
- FALTA VERIFICAR: retestes/regressão após correções de defeitos. Se houver defeitos corrigidos, precisam de evidências de reteste registradas.

---

06_DEFEITOS — INCOMPLETA (VAZIA) 
- Nenhum arquivo de exportação de GitHub Issues ou Jira; nenhum relatório consolidado (PDF/CSV); nenhum Apêndice G preenchido.
- FALTA: exportação de todos os defeitos REAIS (não inventados). Cada defeito deve ter: título, ambiente/versão, pré-condições, passos, esperado x obtido, severidade, prioridade, evidências, status, requisito e caso relacionados.
- Como não há registros no repositório, fica pendente de exportação/provimento pelo usuário.

---

07_AUTOMACAO_UNITARIA — COMPLETA (com ressalvas) *
- 26 arquivos *.test.ts copiados (excede mínimo de 6; frameworks usados: vitest/Jest pelo package.json).
- Comando de execução está no package.json (script test). Resultado das execuções precisa ser registrado como evidência (não inventado).

---

08_INTEGRACAO_API — INCOMPLETA (VAZIA) ** Perugntar se é obrigatório pro élvio
- Nenhum arquivo encontrado.
- FALTA: coleção e ambiente Postman exportados em JSON.
- FALTA: pelo menos 5 testes de integração/API automatizados, com pelo menos um fluxo positivo e um negativo por operação crítica.
- FALTA: evidências de execução.
- Nota: route.test.ts está em 07 (unitário), não substitui integração/API.

---

09_SISTEMA_INTERFACE — INCOMPLETA *
- Existe apenas tests/e2e/ (test_autenticacao.py usando Playwright, não Selenium).
- FALTA: pelo menos 3 testes adicionais para atingir o mínimo de 4.
- FALTA: verificações reais, capturas ou logs de falhas.
- OBSERVAÇÃO REAL: o documento exige Selenium explicitamente; se o professor aceitar Playwright, a quantidade ainda é insuficiente (apenas 1 arquivo). Não presumir aceitação sem confirmar.

---

10_ACEITACAO_NAO_FUNCIONAIS — INCOMPLETA (VAZIA)
- Nenhum arquivo encontrado.
- FALTA: mínimo de 4 cenários de aceitação (Apêndice I), com decisão (Aceito / Aceito com ressalvas / Não aceito) e observações.
- FALTA: mínimo de 6 testes não funcionais, distribuídos em pelo menos 3 categorias (desempenho básico, usabilidade, compatibilidade, confiabilidade, segurança básica), registrados conforme Apêndice I.

---

11_METRICAS_E_QUALIDADE — INCOMPLETA (VAZIA)
- Nenhum arquivo encontrado.
- FALTA: P10 planilha de métricas (Apêndice K) com no mínimo 8 indicadores (percentual de execução, taxa de aprovação, taxa de reprovação, cobertura de requisitos, taxa de automação, defeitos por severidade, defeitos por status, taxa de reabertura), fonte dos dados, interpretação e gráficos legíveis.
- FALTA: evidências das 2 execuções do SonarQube (linha de base e posterior); se tecnicamente compatível, incluir relatórios.

---

12_TDD_CICD_MELHORIA — INCOMPLETA
- Pipeline: .github/workflows/supabase-keep-alive.yml existe.
- FALTA: evidência de execução do pipeline com falha seguida de correção e execução aprovada (instrução 2.2, 12).
- TDD: nenhuma evidência de evolução por TDD (RED, GREEN, REFACTOR) com commits relacionados; nenhum arquivo/documento que prove a evolução.
- FALTA: plano de melhoria contínua com prioridades, responsáveis e critérios de verificação (Apêndice J).

---

13_RELATORIO_FINAL — INCOMPLETA (VAZIA)
- Nenhum arquivo em DOCX editável nem PDF idêntico.
- FALTA: relatório final P12 com todos os capítulos obrigatórios (Capa, Folha de identificação, Sumário, 1. Introdução, 2. Caracterização do sistema, 3. Escopo/requisitos/riscos, 4. Planejamento, 5. Especificação, 6. Execução e defeitos, 7. Automação, 8. Integração e sistema, 9. Aceitação e não funcionais, 10. Métricas, 11. TDD/CI/CD/melhoria, 12. Discussão dos resultados, 13. Conclusão, Referências, Apêndices e anexos).

---

14_APRESENTACAO_E_VIDEO_CONTINGENCIA — INCOMPLETA (VAZIA)
- Nenhum arquivo encontrado.
- FALTA: PPTX e PDF da apresentação.
- FALTA: roteiro de demonstração.
- FALTA: vídeo de contingência (MP4 ou link acessível) com demonstração curta dos principais testes.

---

15_DIARIO_DE_PARTICIPACAO — INCOMPLETA (VAZIA)
- Nenhum arquivo encontrado.
- FALTA: diário de participação (Apêndice L) com data, atividade, responsável principal, colaboradores, tempo e evidência.

---

16_BACKUP_ENTREGA — COMPLETA (com ressalvas) *
- Cópia interna feita (pasta duplicada e /tmp/). Recomenda-se gerar cópia compactada (.zip) antes do upload final.

---

RESUMO DAS QUANTIDADES MÍNIMAS (instrução 1, seção 1)
- Requisitos no escopo: 8 mín. (atual 0) → PENDENTE
- Riscos documentados: 8 mín. (atual 0) → PENDENTE
- Casos de teste manuais: 24 mín. (atual 24) → OK
- Execuções manuais: 24 mín. (atual 24) → OK (verificar retestes)
- Testes unitários automatizados: 6 mín. (atual 26) → OK
- Testes de integração/API automatizados: 5 mín. (atual 0) → PENDENTE
- Testes de sistema/interface (Selenium): 4 mín. (atual 1, Playwright) → PENDENTE
- Cenários de aceitação: 4 mín. (atual 0) → PENDENTE
- Testes não funcionais: 6 mín. em 3 categorias (atual 0) → PENDENTE
- Métricas: 8 mín. (atual 0) → PENDENTE
- Evolução por TDD: 1 com evidências (atual 0) → PENDENTE
- Pipeline CI/CD: 1 com evidências (arquivo existe, evidências de falha/correção/aprovado faltam) → PENDENTE
- Análise de qualidade (SonarQube): 2 execuções (linha de base + posterior) (atual 0) → PENDENTE

---

ORIENTAÇÃO AO USUÁRIO
- Nenhum conteúdo inventado, simulado ou presupondo aprovação do professor foi incluído nesta análise.
- Não crie defeitos, evidências, métricas, capturas, vídeos ou resultados falsos para preencher pastas; isso compromete a nota (instrução 1).
- Quando completar os itens pendentes, chame novamente para reanalisar apenas as pastas pendentes.
- Confirmar com o professor: nome da turma, número do grupo, nome do sistema, aprovação do sistema (Apêndice A / P01), aceitação do Playwright em vez de Selenium, e se o comprovante de entrega existe.
