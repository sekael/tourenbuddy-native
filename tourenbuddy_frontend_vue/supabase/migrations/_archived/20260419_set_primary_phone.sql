CREATE OR REPLACE FUNCTION set_primary_phone(p_contact_id uuid, p_method_id uuid)
RETURNS SETOF contact_methods
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  UPDATE contact_methods
    SET is_primary = false
  WHERE contact_id = p_contact_id
    AND method_type = 'phone'
    AND id <> p_method_id;

  UPDATE contact_methods
    SET is_primary = true
  WHERE id = p_method_id
    AND contact_id = p_contact_id
    AND method_type = 'phone';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'method % not found for contact % or is not a phone method', p_method_id, p_contact_id;
  END IF;

  RETURN QUERY
    SELECT * FROM contact_methods
    WHERE contact_id = p_contact_id
      AND method_type = 'phone';
END;
$$;
