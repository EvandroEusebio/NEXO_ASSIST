import type { Prisma } from "../generated/prisma/client"

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
const stopwords = new Set([
  "como",
  "para",
  "com",
  "uma",
  "que",
  "meu",
  "minha",
  "nao",
  "esta",
  "pelo",
  "pela",
  "preciso",
  "ajuda",
  "quero",
  "posso",
  "fazer",
])

/** Small seeded knowledge base: local text search, without embeddings or paid APIs. */
export async function searchHelp(
  db: Pick<Prisma.TransactionClient, "helpArticle">,
  query: string
) {
  const words = [...new Set(normalize(query).match(/[a-z0-9]+/g) ?? [])]
    .filter((word) => word.length >= 3 && !stopwords.has(word))
    .slice(0, 20)
  if (!words.length) return []
  const articles = await db.helpArticle.findMany({
    orderBy: { title: "asc" },
    take: 100,
  })
  return articles
    .map((article) => {
      const title = normalize(article.title)
      const tags = normalize(article.tags.join(" "))
      const content = normalize(article.content)
      const score = words.reduce(
        (sum, word) =>
          sum +
          (title.includes(word) ? 3 : 0) +
          (tags.includes(word) ? 2 : 0) +
          (content.includes(word) ? 1 : 0),
        0
      )
      return { ...article, score }
    })
    .filter((article) => article.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
}
