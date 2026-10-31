DROP POLICY IF EXISTS pops_location_mapping_select ON public.pops_location_mapping;
CREATE POLICY pops_location_mapping_select ON public.pops_location_mapping
  FOR SELECT TO authenticated USING (public.is_active_approved_user());

DROP POLICY IF EXISTS parque_vf_config_select ON public.parque_validation_filial_config;
CREATE POLICY parque_vf_config_select ON public.parque_validation_filial_config
  FOR SELECT TO authenticated USING (public.is_active_approved_user());

DROP POLICY IF EXISTS training_goal_settings_select_authenticated ON public.training_goal_settings;
CREATE POLICY training_goal_settings_select_authenticated ON public.training_goal_settings
  FOR SELECT TO authenticated USING (public.is_active_approved_user());

DROP POLICY IF EXISTS campaign_rules_select_authenticated ON public.campaign_rules;
CREATE POLICY campaign_rules_select_authenticated ON public.campaign_rules
  FOR SELECT TO authenticated USING (public.is_active_approved_user());