# PNGs de objeto (opcional)

Um arquivo `<tipo>.png` aqui substitui o desenho procedural daquele tipo em todos os mapas
(ex.: `bar_stool.png`, `police_car_small.png`).

- Vista **exatamente de cima**, fundo transparente, sem texto/logotipo legível.
- Frente do objeto **para cima** (norte): `rot` do YAML gira a partir daí.
- A imagem é esticada para a pegada padrão do tipo (`size` em `maps/src/props/*.ts`)
  e projeta sombra pela silhueta, com a altura `height` do tipo (padrão 0,8 m).
- Só vale para tipos posicionados por `at` ou `rect`. Balcões (`path`), bagunça
  (`clutter`) e varais continuam procedurais.
