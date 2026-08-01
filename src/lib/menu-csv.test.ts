import { describe, expect, it } from 'vitest'
import { csvToDraft, parseMenuCsv } from './menu-csv'

describe('parseMenuCsv', () => {
  it('reads the basic shape', () => {
    const result = parseMenuCsv('name,category,price\nButter Chicken,mains,520\nGarlic Naan,breads,90\n')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toEqual({ name: 'Butter Chicken', category: 'mains', priceRupees: 520 })
  })

  it('survives Excel: BOM, CRLF, quoted commas, ₹ and thousand separators', () => {
    const text = '﻿name,category,price\r\n"Paneer, Extra Spicy",starters,"₹1,249.50"\r\n'
    const result = parseMenuCsv(text)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows[0]!.name).toBe('Paneer, Extra Spicy')
    expect(result.rows[0]!.priceRupees).toBe(1249.5)
  })

  it('reads an optional cost column and leaves it off when absent', () => {
    const withCost = parseMenuCsv('name,price,cost\nDal,340,110\n')
    expect(withCost.ok && withCost.rows[0]!.costRupees).toBe(110)

    const without = parseMenuCsv('name,price\nDal,340\n')
    expect(without.ok && without.rows[0]!.costRupees).toBeUndefined()
  })

  it('accepts columns in any order and alternate header names', () => {
    const result = parseMenuCsv('price,item,section\n60,Masala Chai,beverages\n')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows[0]).toEqual({ name: 'Masala Chai', category: 'beverages', priceRupees: 60 })
  })

  it('skips unpriceable rows with a warning, never silently', () => {
    const result = parseMenuCsv('name,price\nGood,100\nBad,not-a-price\n')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows).toHaveLength(1)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('Bad')
  })

  it('refuses a file with no usable header', () => {
    expect(parseMenuCsv('just,some,words\na,b,c\n')).toEqual({ ok: false, reason: 'NO_HEADER' })
    expect(parseMenuCsv('')).toEqual({ ok: false, reason: 'EMPTY' })
    expect(parseMenuCsv('name,price\n')).toEqual({ ok: false, reason: 'NO_ROWS' })
  })

  it('defaults a missing category rather than dropping the row', () => {
    const result = parseMenuCsv('name,price\nDal,340\n')
    expect(result.ok && result.rows[0]!.category).toBe('mains')
  })

  it('lands in the same draft shape the extractor produces', () => {
    const parsed = parseMenuCsv('name,category,price\nDal,mains,340\n')
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const draft = csvToDraft(parsed)
    expect(draft.items[0]).toEqual({ name: 'Dal', category: 'mains', priceRupees: 340 })
  })
})
