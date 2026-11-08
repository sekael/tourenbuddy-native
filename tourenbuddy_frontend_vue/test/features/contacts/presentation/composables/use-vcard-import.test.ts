import { describe, expect, it } from 'vitest'
import { VCardImportError } from '@/core/exceptions'
import {
  parseVCardText,
  useVCardImport,
} from '@/features/contacts/presentation/composables/use-vcard-import'

const singleVCard = `BEGIN:VCARD
VERSION:3.0
FN:Max Muster
N:Muster;Max;;;
TEL;TYPE=CELL:+41 79 123 45 67
END:VCARD`

const multiVCard = `BEGIN:VCARD
VERSION:3.0
FN:Anna Bauer
N:Bauer;Anna;;;
TEL:079 111 22 33
END:VCARD
BEGIN:VCARD
VERSION:3.0
FN:Bob
END:VCARD`

const noPhoneVCard = `BEGIN:VCARD
VERSION:3.0
FN:Lisa Müller
N:Müller;Lisa;;;
END:VCARD`

const fnOnlyVCard = `BEGIN:VCARD
VERSION:4.0
FN:Thomas von Burg
END:VCARD`

const telWithTypeVCard = `BEGIN:VCARD
VERSION:3.0
FN:Test User
TEL;TYPE=WORK,VOICE:+41 44 555 66 77
END:VCARD`

describe('parseVCardText', () => {
  it('should parse single vCard with FN and N', () => {
    const result = parseVCardText(singleVCard)
    expect(result).toHaveLength(1)
    expect(result[0]!.firstName).toBe('Max')
    expect(result[0]!.lastName).toBe('Muster')
    expect(result[0]!.phones).toHaveLength(1)
    expect(result[0]!.phones[0]).toEqual({
      value: '+41791234567',
      label: 'Mobile',
      isPrimary: true,
    })
    expect(result[0]!.rawPhoneNumbers).toHaveLength(0)
  })

  it('should parse multiple vCard blocks and normalize phone numbers to E.164', () => {
    const result = parseVCardText(multiVCard)
    expect(result).toHaveLength(2)
    expect(result[0]!.firstName).toBe('Anna')
    expect(result[0]!.lastName).toBe('Bauer')
    expect(result[0]!.phones[0]!.value).toBe('+41791112233')
    expect(result[0]!.phones[0]!.isPrimary).toBe(true)
    expect(result[1]!.firstName).toBe('Bob')
    expect(result[1]!.phones).toHaveLength(0)
  })

  it('should return empty phones array when no TEL field', () => {
    const result = parseVCardText(noPhoneVCard)
    expect(result[0]!.phones).toHaveLength(0)
    expect(result[0]!.rawPhoneNumbers).toHaveLength(0)
  })

  it('should use FN field when N field absent', () => {
    const result = parseVCardText(fnOnlyVCard)
    expect(result[0]!.firstName).toBe('Thomas')
    expect(result[0]!.lastName).toBe('von Burg')
  })

  it('should parse TEL field with type parameters and derive label', () => {
    const result = parseVCardText(telWithTypeVCard)
    expect(result[0]!.phones[0]!.value).toBe('+41445556677')
    expect(result[0]!.phones[0]!.label).toBe('Work')
  })

  it('should return empty array for text with no vCards', () => {
    expect(parseVCardText('no vcard here')).toHaveLength(0)
  })

  it('should prefer N field over FN for name', () => {
    const vcard = `BEGIN:VCARD
VERSION:3.0
FN:Wrong Name
N:Correct;Also;;;
END:VCARD`
    const result = parseVCardText(vcard)
    expect(result[0]!.firstName).toBe('Also')
    expect(result[0]!.lastName).toBe('Correct')
  })

  it('normalizes Swiss national phone number to E.164', () => {
    const vcard = `BEGIN:VCARD
VERSION:3.0
FN:Test
TEL:0791234567
END:VCARD`
    const result = parseVCardText(vcard)
    expect(result[0]!.phones[0]!.value).toBe('+41791234567')
  })

  it('handles unparseable phone gracefully — skips it and adds to rawPhoneNumbers', () => {
    const vcard = `BEGIN:VCARD
VERSION:3.0
FN:Test
TEL:ext. 1234
END:VCARD`
    const result = parseVCardText(vcard)
    expect(result[0]!.phones).toHaveLength(0)
    expect(result[0]!.rawPhoneNumbers).toEqual(['ext. 1234'])
  })

  it('handles contact with mix of parseable and unparseable phones', () => {
    const vcard = `BEGIN:VCARD
VERSION:3.0
FN:Mix
TEL;TYPE=CELL:+41 79 123 45 67
TEL:not-a-number
END:VCARD`
    const result = parseVCardText(vcard)
    expect(result[0]!.phones).toHaveLength(1)
    expect(result[0]!.phones[0]!.value).toBe('+41791234567')
    expect(result[0]!.rawPhoneNumbers).toEqual(['not-a-number'])
  })

  it('extracts multiple phones with correct labels', () => {
    const vcard = `BEGIN:VCARD
VERSION:3.0
FN:Multi
TEL;TYPE=CELL:+41 79 123 45 67
TEL;TYPE=HOME:+41 44 222 33 44
END:VCARD`
    const result = parseVCardText(vcard)
    expect(result[0]!.phones).toHaveLength(2)
    expect(result[0]!.phones[0]).toEqual({
      value: '+41791234567',
      label: 'Mobile',
      isPrimary: true,
    })
    expect(result[0]!.phones[1]).toEqual({
      value: '+41442223344',
      label: 'Home',
      isPrimary: false,
    })
  })

  it('vCard 3.0 PREF marker selects primary', () => {
    const vcard = `BEGIN:VCARD
VERSION:3.0
FN:Pref Test
TEL;TYPE=CELL:+41 79 123 45 67
TEL;TYPE=HOME,PREF:+41 44 222 33 44
END:VCARD`
    const result = parseVCardText(vcard)
    expect(result[0]!.phones[0]!.isPrimary).toBe(false)
    expect(result[0]!.phones[1]!.isPrimary).toBe(true)
  })

  it('vCard 4.0 PREF parameter selects primary', () => {
    const vcard = `BEGIN:VCARD
VERSION:4.0
FN:Pref4 Test
TEL;TYPE=CELL:+41 79 123 45 67
TEL;TYPE=HOME;PREF=1:+41 44 222 33 44
END:VCARD`
    const result = parseVCardText(vcard)
    expect(result[0]!.phones[1]!.isPrimary).toBe(true)
    expect(result[0]!.phones[0]!.isPrimary).toBe(false)
  })

  it('no PREF: CELL wins over HOME and WORK regardless of order', () => {
    const vcard = `BEGIN:VCARD
VERSION:3.0
FN:Cell Priority
TEL;TYPE=HOME:+41 44 222 33 44
TEL;TYPE=WORK:+41 44 555 66 77
TEL;TYPE=CELL:+41 79 123 45 67
END:VCARD`
    const result = parseVCardText(vcard)
    const primary = result[0]!.phones.find(p => p.isPrimary)
    expect(primary?.label).toBe('Mobile')
  })

  it('no PREF and no CELL: HOME wins over WORK', () => {
    const vcard = `BEGIN:VCARD
VERSION:3.0
FN:Home Priority
TEL;TYPE=WORK:+41 44 555 66 77
TEL;TYPE=HOME:+41 44 222 33 44
END:VCARD`
    const result = parseVCardText(vcard)
    const primary = result[0]!.phones.find(p => p.isPrimary)
    expect(primary?.label).toBe('Home')
  })

  it('no PREF, CELL, HOME, or WORK: first TEL is primary', () => {
    const vcard = `BEGIN:VCARD
VERSION:3.0
FN:First Fallback
TEL:+41 44 111 22 33
TEL:+41 44 444 55 66
END:VCARD`
    const result = parseVCardText(vcard)
    expect(result[0]!.phones[0]!.isPrimary).toBe(true)
    expect(result[0]!.phones[1]!.isPrimary).toBe(false)
  })

  it('unrecognised TYPE yields null label', () => {
    const vcard = `BEGIN:VCARD
VERSION:3.0
FN:Fax Test
TEL;TYPE=FAX:+41 44 222 33 44
END:VCARD`
    const result = parseVCardText(vcard)
    expect(result[0]!.phones[0]!.label).toBeNull()
  })

  it('single phone contact has isPrimary true', () => {
    const vcard = `BEGIN:VCARD
VERSION:3.0
FN:Single
TEL;TYPE=CELL:+41 79 123 45 67
END:VCARD`
    const result = parseVCardText(vcard)
    expect(result[0]!.phones[0]!.isPrimary).toBe(true)
  })

  it('iOS TYPE=iPhone treated as CELL wins over WORK', () => {
    const vcard = `BEGIN:VCARD
VERSION:3.0
FN:iOS User
TEL;type=WORK;type=VOICE:+41 44 555 66 77
TEL;type=iPhone;type=CELL;type=VOICE:+41 79 123 45 67
END:VCARD`
    const result = parseVCardText(vcard)
    const primary = result[0]!.phones.find(p => p.isPrimary)
    expect(primary?.value).toBe('+41791234567')
    expect(primary?.label).toBe('Mobile')
  })

  it('iOS TYPE=iPhone only (no CELL) treated as mobile, wins over WORK', () => {
    const vcard = `BEGIN:VCARD
VERSION:3.0
FN:iOS User2
TEL;type=WORK;type=VOICE:+41 44 555 66 77
TEL;type=iPhone;type=VOICE:+41 79 123 45 67
END:VCARD`
    const result = parseVCardText(vcard)
    const primary = result[0]!.phones.find(p => p.isPrimary)
    expect(primary?.value).toBe('+41791234567')
  })
})

describe('deduplication and email extraction', () => {
  it('two identical TEL lines collapse to one entry', () => {
    const vcard = `BEGIN:VCARD
VERSION:3.0
FN:Dup
TEL;TYPE=CELL:+41 79 123 45 67
TEL;TYPE=CELL:+41 79 123 45 67
END:VCARD`
    const result = parseVCardText(vcard)
    expect(result[0]!.phones).toHaveLength(1)
    expect(result[0]!.phones[0]!.value).toBe('+41791234567')
  })

  it('two TEL lines normalizing to same E.164 collapse with first non-null label preserved', () => {
    const vcard = `BEGIN:VCARD
VERSION:3.0
FN:Label Merge
TEL;TYPE=CELL:+41791234567
TEL:079 123 45 67
END:VCARD`
    const result = parseVCardText(vcard)
    expect(result[0]!.phones).toHaveLength(1)
    expect(result[0]!.phones[0]!.label).toBe('Mobile')
  })

  it('pREF on a duplicate copy is preserved post-dedupe', () => {
    const vcard = `BEGIN:VCARD
VERSION:3.0
FN:Pref Dup
TEL;TYPE=HOME:+41 44 222 33 44
TEL;TYPE=HOME,PREF:+41 44 222 33 44
END:VCARD`
    const result = parseVCardText(vcard)
    expect(result[0]!.phones).toHaveLength(1)
    expect(result[0]!.phones[0]!.isPrimary).toBe(true)
  })

  it('duplicate rawPhoneNumbers collapse case-insensitively', () => {
    const vcard = `BEGIN:VCARD
VERSION:3.0
FN:Raw Dup
TEL:ext. 1234
TEL:EXT. 1234
END:VCARD`
    const result = parseVCardText(vcard)
    expect(result[0]!.rawPhoneNumbers).toHaveLength(1)
    expect(result[0]!.rawPhoneNumbers[0]).toBe('ext. 1234')
  })

  it('unparseable TEL not in phones, present in rawPhoneNumbers', () => {
    const vcard = `BEGIN:VCARD
VERSION:3.0
FN:Bad Phone
TEL:not-a-number
END:VCARD`
    const result = parseVCardText(vcard)
    expect(result[0]!.phones).toHaveLength(0)
    expect(result[0]!.rawPhoneNumbers).toEqual(['not-a-number'])
  })

  it('distinct phones not collapsed', () => {
    const vcard = `BEGIN:VCARD
VERSION:3.0
FN:Multi
TEL;TYPE=CELL:+41 79 123 45 67
TEL;TYPE=HOME:+41 44 222 33 44
END:VCARD`
    const result = parseVCardText(vcard)
    expect(result[0]!.phones).toHaveLength(2)
  })
})

describe('useVCardImport', () => {
  function makeFile(content: string, name = 'contacts.vcf') {
    return new File([content], name, { type: 'text/vcard' })
  }

  const vcfContent = `BEGIN:VCARD
VERSION:3.0
FN:Max Muster
N:Muster;Max;;;
TEL;TYPE=CELL:+41791234567
END:VCARD`

  const multiBlockVcf = `BEGIN:VCARD
VERSION:3.0
FN:Alice
N:;Alice;;;
TEL;TYPE=CELL:+41791234567
END:VCARD
BEGIN:VCARD
VERSION:3.0
FN:Bob
N:;Bob;;;
TEL;TYPE=CELL:+41791000000
END:VCARD`

  it('should throw when zero files provided', async () => {
    const { parseVCardFiles } = useVCardImport()
    await expect(parseVCardFiles([])).rejects.toThrow('Exactly one .vcf file must be provided')
  })

  it('should throw when more than one file provided', async () => {
    const { parseVCardFiles } = useVCardImport()
    const files = [makeFile(vcfContent), makeFile(vcfContent, 'other.vcf')]
    await expect(parseVCardFiles(files)).rejects.toThrow('Exactly one .vcf file must be provided')
  })

  it('should parse a single-file with one vCard block', async () => {
    const { parseVCardFiles } = useVCardImport()
    const result = await parseVCardFiles([makeFile(vcfContent)])
    expect(result).toHaveLength(1)
    expect(result[0]!.firstName).toBe('Max')
    expect(result[0]!.lastName).toBe('Muster')
  })

  it('should parse a single file containing multiple vCard blocks', async () => {
    const { parseVCardFiles } = useVCardImport()
    const result = await parseVCardFiles([makeFile(multiBlockVcf)])
    expect(result).toHaveLength(2)
    expect(result.map(c => c.firstName)).toContain('Alice')
    expect(result.map(c => c.firstName)).toContain('Bob')
  })

  describe('rejected files', () => {
    async function reasonOf(file: File): Promise<string> {
      const { parseVCardFile } = useVCardImport()
      try {
        await parseVCardFile(file)
        return 'no-error'
      }
      catch (err) {
        return err instanceof VCardImportError ? err.reason : 'wrong-error-type'
      }
    }

    it('should reject a zero-byte file as emptyFile', async () => {
      expect(await reasonOf(makeFile(''))).toBe('emptyFile')
    })

    it('should reject a whitespace-only file as emptyFile, not notVCard', async () => {
      expect(await reasonOf(makeFile('  \n\t \r\n'))).toBe('emptyFile')
    })

    it('should reject content without a vCard marker as notVCard', async () => {
      expect(await reasonOf(makeFile('name,phone\nMax,079 123 45 67'))).toBe('notVCard')
    })

    it('should accept vCard content in a file not named .vcf (content beats filename)', async () => {
      const { parseVCardFile } = useVCardImport()
      const result = await parseVCardFile(makeFile(vcfContent, 'contact.txt'))
      expect(result).toHaveLength(1)
      expect(result[0]!.firstName).toBe('Max')
    })

    it('should reject a card with no name and no phone as noContacts', async () => {
      const junk = `BEGIN:VCARD
VERSION:3.0
ORG:Some Company
NOTE:no name, no number
END:VCARD`
      expect(await reasonOf(makeFile(junk))).toBe('noContacts')
    })

    it('should accept lowercase vCard markers (property names are case-insensitive)', async () => {
      const lowercase = `begin:vcard
version:3.0
fn:Max Muster
tel;type=cell:+41791234567
end:vcard`
      const { parseVCardFile } = useVCardImport()
      const result = await parseVCardFile(makeFile(lowercase))
      expect(result).toHaveLength(1)
      expect(result[0]!.firstName).toBe('Max')
    })

    it('should import a nameless card that carries a phone number', async () => {
      const phoneOnly = `BEGIN:VCARD
VERSION:3.0
TEL;TYPE=CELL:+41791234567
END:VCARD`
      const { parseVCardFile } = useVCardImport()
      const result = await parseVCardFile(makeFile(phoneOnly))
      expect(result).toHaveLength(1)
      expect(result[0]!.phones).toHaveLength(1)
    })

    it('should import a nameless card whose only phone is unparseable', async () => {
      const rawOnly = `BEGIN:VCARD
VERSION:3.0
TEL;TYPE=CELL:ext. 1234
END:VCARD`
      const { parseVCardFile } = useVCardImport()
      await expect(parseVCardFile(makeFile(rawOnly))).resolves.toHaveLength(1)
    })

    it('should import the usable contact when only some cards are junk', async () => {
      const mixed = `BEGIN:VCARD
VERSION:3.0
ORG:Some Company
END:VCARD
BEGIN:VCARD
VERSION:3.0
FN:Max Muster
N:Muster;Max;;;
TEL;TYPE=CELL:+41791234567
END:VCARD`
      const { parseVCardFile } = useVCardImport()
      const result = await parseVCardFile(makeFile(mixed))
      expect(result.map(c => c.firstName)).toContain('Max')
    })
  })
})
