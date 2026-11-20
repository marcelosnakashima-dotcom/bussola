import { useMemo } from 'react'
import { useCategories } from '@/hooks/useData'
import type { CatInfo } from '@/lib/finance'

// Categorias como mapa id -> { nome, classificacao } (para os cálculos de src/lib/finance)
export function useCatMap() {
  const { categories, loading } = useCategories()
  const map = useMemo(() => new Map<string, CatInfo>(categories.map(c => [c.id, { nome: c.nome, classificacao: c.classificacao }])), [categories])
  return { cats: map, categories, loading }
}
