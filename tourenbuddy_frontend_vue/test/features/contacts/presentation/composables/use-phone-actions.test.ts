import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { usePhoneActions } from '@/features/contacts/presentation/composables/use-phone-actions'

describe('usePhoneActions', () => {
  describe('e.164 input', () => {
    it('should generate tel link from E.164', () => {
      const { telLink } = usePhoneActions('+41791234567')
      expect(telLink.value).toBe('tel:+41791234567')
    })

    it('should generate WhatsApp link from E.164', () => {
      const { whatsAppLink } = usePhoneActions('+41791234567')
      expect(whatsAppLink.value).toBe('https://wa.me/41791234567')
    })

    it('should produce both links for E.164 input', () => {
      const { telLink, whatsAppLink } = usePhoneActions('+41791234567')
      expect(telLink.value).toBe('tel:+41791234567')
      expect(whatsAppLink.value).toBe('https://wa.me/41791234567')
    })

    it('should produce WhatsApp link for French E.164', () => {
      const { whatsAppLink } = usePhoneActions('+33612345678')
      expect(whatsAppLink.value).toBe('https://wa.me/33612345678')
    })
  })

  describe('legacy non-e.164 input (isValid=false rows)', () => {
    it('should produce tel link only for spaced international', () => {
      const { telLink, whatsAppLink } = usePhoneActions('+41 79 123 45 67')
      expect(telLink.value).toBe('tel:+41791234567')
      expect(whatsAppLink.value).toBeNull()
    })

    it('should produce tel link only for local number', () => {
      const { telLink, whatsAppLink } = usePhoneActions('079 123 45 67')
      expect(telLink.value).toBe('tel:0791234567')
      expect(whatsAppLink.value).toBeNull()
    })

    it('should produce tel link only for 00-prefixed number', () => {
      const { telLink, whatsAppLink } = usePhoneActions('0041 79 123 45 67')
      expect(telLink.value).toBe('tel:0041791234567')
      expect(whatsAppLink.value).toBeNull()
    })
  })

  describe('null input (no phone)', () => {
    it('should return null links for null phone', () => {
      const { telLink, whatsAppLink } = usePhoneActions(null)
      expect(telLink.value).toBeNull()
      expect(whatsAppLink.value).toBeNull()
    })
  })

  describe('reactivity', () => {
    it('should be reactive to ref changes', () => {
      const phone = ref<string | null>('+41791112233')
      const { telLink, whatsAppLink } = usePhoneActions(phone)

      expect(telLink.value).toBe('tel:+41791112233')
      expect(whatsAppLink.value).toBe('https://wa.me/41791112233')

      phone.value = null
      expect(telLink.value).toBeNull()
      expect(whatsAppLink.value).toBeNull()
    })

    it('should update when ref changes from E.164 to legacy', () => {
      const phone = ref<string | null>('+41791234567')
      const { whatsAppLink } = usePhoneActions(phone)
      expect(whatsAppLink.value).toBe('https://wa.me/41791234567')

      phone.value = '079 123 45 67'
      expect(whatsAppLink.value).toBeNull()
    })
  })
})
