# Ações Manuais Necessárias

## 1. Matches Ambíguos Não Resolvidos (2)

Estes matches têm múltiplos candidatos e precisam ser verificados manualmente:

### 1. Gabriela Bambirra
- **Turma**: Palmares - 9 ano A
- **Candidatos**: 3
  1. **Gabriela Bambirra** (ID: 69fa2592c459c67b28508cf6)
     Turma: Palmares - 8 ano B
  2. **Gabriela Bambirra** (ID: 69fa26ccc459c67b28508d07)
     Turma: Palmares - 8 ano B
  3. **GABRIELA BAMBIRRA** (ID: 69fa2901c459c67b28508f09)
     Turma: Palmares - 8 ano B

### 2. Gabriela Vivas Braga
- **Turma**: Palmares - 1 Serie B
- **Candidatos**: 2
  1. **Gabriela Vivas Braga** (ID: 69f9f713d2dc8d7ed0cd30f9)
     Turma: Palmares - 1 Serie A
  2. **Gabriela Vivas Braga** (ID: 69fb9b5ad14860ef4f8b788b)
     Turma: Palmares - 1 Serie A


## 2. Delegações Vazias por Arquivo (25)

| Arquivo | Linhas Vazias |
|---------|---------------|
| paises/8e9/Comite_1_8e9.json | 4 |
| paises/8e9/Comite_2_8e9.json | 2 |
| paises/8e9/Comite_3_8e9.json | 2 |
| paises/8e9/Comite_4_8e9.json | 4 |
| paises/8e9/Comite_5_8e9.json | 6 |
| paises/8e9/Comite_6_8e9.json | 3 |
| paises/8e9/Comite_7_8e9.json | 4 |

## 3. Usuários Não Encontrados (Amostra de 10)

1. **Ana Clara Alves**
   - Turma: Sta Ines - 8 ano
   - Arquivo: paises/8e9/Comite_3_8e9.json:13
   - Status: no candidates

2. **Ester Oliveira Morais**
   - Turma: Sta Ines - 8 ano
   - Arquivo: paises/8e9/Comite_3_8e9.json:13
   - Status: no candidates

3. **Anna Clara Martins Felisale**
   - Turma: Sta Ines - 8 ano
   - Arquivo: paises/8e9/Comite_3_8e9.json:13
   - Status: no candidates

4. **Giovanna Mendes Leite**
   - Turma: Sta Ines - 8º ano
   - Arquivo: paises/8e9/Comite_4_8e9.json:13
   - Status: no candidates

5. **Maria Clara Evangelista**
   - Turma: Sta Ines - 8º ano
   - Arquivo: paises/8e9/Comite_4_8e9.json:13
   - Status: no candidates

6. **Benício Albuquerque Paiva**
   - Turma: Sta Ines - 9º ano
   - Arquivo: paises/8e9/Comite_6_8e9.json:13
   - Status: no candidates

7. **Bianca Eduarda Coelho**
   - Turma: Sta Ines - 9 ano A
   - Arquivo: paises/8e9/Comite_7_8e9.json:6
   - Status: no candidates

8. **Frederico Ferreira Cunha**
   - Turma: Sta Ines - 8 ano
   - Arquivo: paises/8e9/Comite_7_8e9.json:14
   - Status: no candidates

9. **Heitor Franscisco Gonçalves**
   - Turma: Sta Ines - 8 ano
   - Arquivo: paises/8e9/Comite_7_8e9.json:14
   - Status: no candidates

10. **João Marcos B. Oliveira**
   - Turma: Sta Ines - 8 ano
   - Arquivo: paises/8e9/Comite_7_8e9.json:14
   - Status: no candidates


## Como Resolver

### Para Matches Ambíguos:
1. Abra o arquivo correspondente em `paises/*/`
2. Verifique qual candidato é o correto baseado na turma
3. Edite manualmente a linha ou crie um pequeno script para corrigir

### Para Delegações Vazias:
1. Abra o arquivo JSON listado
2. Procure pelas linhas vazias (campo "Membro 1" ou "Turma" vazio)
3. Preencha os dados ou remova as linhas

### Para Usuários Não Encontrados:
1. Verifique se o usuário existe no BD com outro nome
2. Ou adicione o usuário ao BD
3. Ou corrija o nome/turma no arquivo de atribuição

### Depois de Resolver Tudo:
```bash
npm run paises:prepare
npm run paises:resolve
npm run paises:apply-links
npm run paises
```
