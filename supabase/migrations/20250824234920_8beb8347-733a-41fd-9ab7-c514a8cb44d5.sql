-- SECURITY: Enhanced input validation function
CREATE OR REPLACE FUNCTION public.validate_task_input(input_data jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  suspicious_patterns text[] := ARRAY[
    '<script', 'javascript:', 'vbscript:', 'on\w+\s*=', 'data:text/html',
    'eval\s*\(', 'expression\s*\(', '\bxss\b', '\binjection\b'
  ];
  pattern text;
  field_value text;
  key text;
BEGIN
  -- Check each field in the input data
  FOR key IN SELECT jsonb_object_keys(input_data)
  LOOP
    field_value := input_data ->> key;
    
    -- Skip null or empty values
    IF field_value IS NULL OR LENGTH(field_value) = 0 THEN
      CONTINUE;
    END IF;
    
    -- Check against suspicious patterns
    FOREACH pattern IN ARRAY suspicious_patterns
    LOOP
      IF field_value ~* pattern THEN
        -- Log potential XSS/injection attempt
        PERFORM public.secure_log_security_event(
          'suspicious_input_detected',
          auth.uid(),
          jsonb_build_object(
            'field', key,
            'pattern_matched', pattern,
            'input_length', LENGTH(field_value),
            'sanitized_sample', LEFT(field_value, 100)
          ),
          4
        );
        RETURN false;
      END IF;
    END LOOP;
    
    -- Check for excessively long inputs (potential DoS)
    IF LENGTH(field_value) > 10000 THEN
      PERFORM public.secure_log_security_event(
        'oversized_input_detected',
        auth.uid(),
        jsonb_build_object(
          'field', key,
          'input_length', LENGTH(field_value)
        ),
        3
      );
      RETURN false;
    END IF;
  END LOOP;
  
  RETURN true;
END;
$function$;