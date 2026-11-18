// The confirm gate's tables: every name QA and the security review tried.
// Generated once from their scripts (qa/sends.ts, qa/all.ts, qa/tests/qa.test.ts, cos/t1.ts, cos/t2.ts);
// edit by hand from here on.

/** QA's "must gate": every one asks. */
export const MUST_GATE = [
  'mcp__Gmail__send_message', 'mcp__Gmail__reply', 'mcp__Gmail__forward', 'mcp__Gmail__trash_thread', 'mcp__Gmail__trash_message',
  'mcp__Slack__slack_send_message', 'mcp__Slack__slack_schedule_message', 'mcp__Taplio__publish_draft', 'mcp__Taplio__schedule_draft',
  'mcp__Taplio__commit_comment_draft', 'mcp__Taplio__like_post', 'mcp__Taplio__send_connection_request', 'mcp__Canva__comment-on-design',
  'mcp__Higgsfield__publish_website', 'mcp__Higgsfield__deploy_website', 'mcp__Higgsfield__tiktok_publish',
  'mcp__Google_Calendar__create_event', 'mcp__Google_Calendar__update_event', 'mcp__Google_Calendar__delete_event',
  'mcp__Google_Calendar__respond_to_event', 'mcp__Higgsfield__share_project', 'mcp__Higgsfield__gpu_rent',
  'mcp__Higgsfield__gpu_job_start', 'mcp__Higgsfield__meta_ads_write', 'mcp__Higgsfield__publish_playable_game',
  'mcp__Higgsfield__participate_in_contest', 'mcp__Higgsfield__publish_project', 'mcp__Higgsfield__unpublish_project',
  'mcp__Higgsfield__update_project_sharing', 'mcp__Higgsfield__confirm_project_publication_review',
  'mcp__Higgsfield__update_project_publication', 'mcp__Higgsfield__delete_project', 'mcp__Higgsfield__delete_folder',
  'mcp__Higgsfield__gpu_rental_exec', 'mcp__Higgsfield__cancel_trial_auto_renewal', 'mcp__Higgsfield__send_feedback',
  'mcp__Canva__reply-to-comment', 'mcp__Canva__publish-brand-template', 'mcp__Slack__slack_add_reaction',
  'mcp__Slack__slack_create_conversation', 'mcp__Taplio__delete_draft', 'mcp__Taplio__cancel_connection_request',
  'mcp__Gmail__delete_draft', 'mcp__Gmail__delete_label', 'mcp__Gmail__mark_message_spam', 'mcp__Gmail__mark_thread_spam',
  'mcp__Claude_Docs__delete', 'mcp__21st__submit_component', 'mcp__21st__delete_component', 'mcp__21st__send_feedback',
  'mcp__99tests__create_test_job', 'mcp__ChangeThisFile__translate_file', 'mcp__Composio__COMPOSIO_MULTI_EXECUTE_TOOL',
  'mcp__Composio__COMPOSIO_PROXY_EXECUTE', 'mcp__Higgsfield__website_secrets', 'mcp__Higgsfield__website_db',
  'mcp__Higgsfield__meta_ads_connect', 'mcp__Higgsfield__tiktok_connect',
]

/** QA's "must pass" that still pass under the allow-list: reads, drafts, and generation (credits free). */
export const MUST_PASS = [
  'mcp__Gmail__search_threads', 'mcp__Gmail__get_message', 'mcp__Gmail__list_drafts', 'mcp__Gmail__create_draft',
  'mcp__Gmail__update_draft', 'mcp__Gmail__get_thread', 'mcp__Slack__slack_send_message_draft', 'mcp__Slack__slack_read_channel',
  'mcp__Slack__slack_read_thread', 'mcp__Slack__slack_search_public', 'mcp__Slack__slack_get_reactions', 'mcp__Taplio__create_draft',
  'mcp__Taplio__update_draft', 'mcp__Taplio__create_comment_draft', 'mcp__Taplio__update_comment_draft', 'mcp__Taplio__get_post_analytics',
  'mcp__Taplio__list_posts', 'mcp__Taplio__get_post', 'mcp__Taplio__find_posts_to_comment', 'mcp__Taplio__find_comments_to_reply',
  'mcp__Taplio__list_comment_drafts', 'mcp__Taplio__get_comment_draft', 'mcp__Taplio__list_comment_feeds',
  'mcp__Taplio__get_connection_request', 'mcp__Taplio__list_connection_requests', 'mcp__Taplio__get_post_like',
  'mcp__Google_Calendar__list_events', 'mcp__Google_Calendar__suggest_time', 'mcp__Google_Calendar__get_event',
  'mcp__Higgsfield__estimate_video_cost', 'mcp__Higgsfield__list_projects', 'mcp__Higgsfield__get_project_publication',
  'mcp__Higgsfield__get_playable_game_publication', 'mcp__Higgsfield__get_project_sharing', 'mcp__Canva__search-designs',
  'mcp__Canva__list-comments', 'mcp__Canva__list-replies', 'mcp__Canva__generate-design', 'mcp__Booking_com__accommodations_search',
  'mcp__Slack__slack_list_user_channels',
]

/**
 * QA's "must pass" that now ask, by the 0.10 allow-list decision: each acts (untrash, label,
 * cancel, unschedule, save, request, export), names a publish, or has a word that is no known
 * read word or noun (gpu, tiktok), or runs code (browser_exec).
 */
export const NOW_ASK = [
  'mcp__Gmail__untrash_message', 'mcp__Gmail__label_message', 'mcp__Taplio__cancel_like', 'mcp__Taplio__unschedule',
  'mcp__Taplio__cancel_comment_draft', 'mcp__Higgsfield__tiktok_publish_status', 'mcp__Higgsfield__tiktok_prepare_publish',
  'mcp__Higgsfield__gpu_job_quote', 'mcp__Higgsfield__gpu_job_status', 'mcp__Higgsfield__save_project_publication_preview',
  'mcp__Higgsfield__cancel_project_publication_review', 'mcp__Canva__request-outline-review', 'mcp__Canva__export-design',
  'mcp__plugin_browser-use_browser-use__browser_exec',
]

/** Real tools from QA's bug 2 and the security review: all ask but drafts and generation. */
export const REAL_ASK = [
  'mcp__Higgsfield__deploy_website', 'mcp__Google_Calendar__create_event', 'mcp__Google_Calendar__update_event',
  'mcp__Higgsfield__share_project', 'mcp__Higgsfield__update_project_sharing', 'mcp__Higgsfield__gpu_rent',
  'mcp__Higgsfield__gpu_job_start', 'mcp__Higgsfield__meta_ads_write', 'mcp__Higgsfield__participate_in_contest',
  'mcp__Higgsfield__confirm_project_publication_review', 'mcp__Higgsfield__unpublish_project', 'mcp__x__post_status',
  'mcp__x__delete_status', 'mcp__stripe__create_refund', 'mcp__x__place_order', 'mcp__github__merge_pull_request',
  'mcp__vercel__deploy_to_vercel', 'mcp__cloudflare__workers_deploy', 'mcp__netlify__deploy_site',
  'mcp__Google_Calendar__create_calendar_event', 'mcp__gdrive__share_file', 'mcp__Gmail__send_draft', 'mcp__Gmail__sendDraft',
  'mcp__Gmail__modify_labels', 'mcp__Gmail__batch_modify', 'mcp__Slack__slack_send_message', 'mcp__Slack__slack_schedule_message',
  'mcp__Slack__slack_create_canvas', 'mcp__Slack__slack_update_canvas', 'mcp__Slack__slack_add_reaction',
  'mcp__Taplio__commit_comment_draft', 'mcp__Taplio__schedule_draft', 'mcp__Taplio__publish_draft', 'mcp__Higgsfield__execute_preset',
  'mcp__Higgsfield__send_feedback', 'mcp__ChangeThisFile__do_file_job', 'mcp__ChangeThisFile__convert_file', 'mcp__Claude_Docs__batch',
  'mcp__Claude_Docs__update', 'mcp__Claude_Docs__create', 'mcp__github__create_pull_request', 'mcp__github__push_files',
  'mcp__github__create_or_update_file', 'mcp__github__create_issue', 'mcp__github__add_issue_comment', 'mcp__github__create_release',
  'mcp__github__delete_branch', 'mcp__stripe__create_payment_link', 'mcp__stripe__create_invoice', 'mcp__stripe__finalize_invoice',
  'mcp__stripe__create_charge', 'mcp__stripe__create_subscription', 'mcp__twilio__make_call', 'mcp__twilio__messages_create',
  'mcp__linkedin__share', 'mcp__dc__write_file', 'mcp__dc__start_process', 'mcp__dc__interact_with_process', 'mcp__dc__move_file',
  'mcp__dc__edit_block', 'mcp__browser__browser_exec', 'mcp__db__execute_sql', 'mcp__db__drop_table', 'mcp__db__remove_user',
  'mcp__s3__put_object', 'mcp__dns__update_record', 'mcp__dns__set_record', 'mcp__Gmail__unsubscribe_and_delete',
]
export const REAL_PASS = [
  'mcp__Gmail__create_draft', 'mcp__Slack__slack_send_message_draft', 'mcp__Taplio__create_post_draft', 'mcp__Taplio__update_draft',
  'mcp__Higgsfield__generate_image', 'mcp__Higgsfield__generate_video', 'mcp__Higgsfield__ai_influencer_generate',
  'mcp__Higgsfield__create_voice',
]

/** Made-up names from QA and the security review (separators, camelCase, compounds): all ask. */
export const MADE_UP = [
  'mcp__Higgsfield__tiktok_publish', 'mcp__x__post_message', 'mcp__x__postMessage', 'mcp__x__create_post', 'mcp__x__posts_create',
  'mcp__x__get_and_send', 'mcp__x__list_and_delete', 'mcp__x__search_then_publish', 'mcp__x__unpublish', 'mcp__x__undo_send',
  'mcp__x__checkout_branch', 'mcp__github__create_pull_request_review', 'mcp__github__merge_pull_request', 'mcp__github__delete_branch',
  'mcp__github__push_files', 'mcp__github__add_issue_comment', 'mcp__x__SEND', 'mcp__x__Send-Message', 'mcp__x__send.message',
  'mcp__stripe__create_refund', 'mcp__stripe__create_invoice', 'mcp__x__email_send', 'mcp__x__message_send', 'mcp__x__messages_send',
  'mcp__x__sendmessage', 'mcp__x__deleteFile', 'mcp__x__removeFile', 'mcp__x__drop_table', 'mcp__x__execute_sql', 'mcp__x__commit',
  'mcp__git__git_commit', 'mcp__x__get_commit', 'mcp__x__commit_status', 'mcp__x__view_and_delete', 'mcp__x__fetch_then_trash',
  'mcp__x__preview_post', 'mcp__x__post_preview', 'mcp__x__delete_status', 'mcp__x__post_status', 'mcp__x__update_status',
  'mcp__a__b__c__send', 'mcp__x__sendHTMLEmail', 'mcp__x__sendSMS', 'mcp__x__SMSSend', 'mcp__x__tweet_thread', 'mcp__x__x_post',
  'mcp__x__bulk_delete', 'mcp__x__batch_send', 'mcp__x__mass_email', 'mcp__x__email', 'mcp__x__notify_user', 'mcp__x__invite_user',
  'mcp__x__approve_payment', 'mcp__x__payout', 'mcp__x__refund', 'mcp__x__charge_card', 'mcp__x__wire', 'mcp__x__submit_order',
  'mcp__x__place_order', 'mcp__x__create_tweet', 'mcp__x__tweet', 'mcp__x__undo_retweet', 'mcp__x__untrash_and_send',
  'mcp__svc__get_and_send', 'mcp__svc__resolve_and_pay', 'mcp__svc__check_out', 'mcp__svc__checkout_cart', 'mcp__svc__preview_and_publish',
  'mcp__svc__unsend', 'mcp__svc__unlike', 'mcp__a__post', 'mcp__a__send', 'mcp__a__sendEmail', 'mcp__a__SENDEMAIL', 'mcp__a__sendemail',
  'mcp__a__send-email', 'mcp__a__Send Email', 'mcp__a__emailSend', 'mcp__a__emails_send', 'mcp__a__mail_send', 'mcp__a__sends_message',
  'mcp__a__sending', 'mcp__a__publish_status', 'mcp__a__publish_now_status', 'mcp__a__send_message_preview', 'mcp__a__send_info',
  'mcp__a__pay_config', 'mcp__a__draft_and_send', 'mcp__a__send_draft', 'mcp__a__send_drafts', 'mcp__a__create_draft_and_send',
  'mcp__a__email_draft_send', 'mcp__a__send_now_drafts', 'mcp__a__xsend', 'mcp__a__sendHTMLEmail', 'mcp__a__sendHTML_email',
  'mcp__a__send2', 'mcp__a__post2', 'mcp__a__ab_send', 'mcp__a_b__send', 'mcp__a__b__send', 'mcp__a__b__get_x', 'mcp__a__get__send',
  'mcp__plugin_x_y__send_message', 'mcp__claude_ai_Gmail__send_email', 'mcp__a__ab_cd_send', 'mcp__a__ab_update_and_send',
  'mcp__m__post_status', 'mcp__m__mastodon_post_status', 'mcp__a__delete_history', 'mcp__a__delete_chat_history', 'mcp__a__purge_history',
  'mcp__a__delete_settings', 'mcp__a__send_analytics', 'mcp__a__transfer_config', 'mcp__a__unsubscribe', 'mcp__a__unarchive_and_send',
  'mcp__a__unblock_user', 'mcp__a__publish_preview', 'mcp__a__schedule_status',
]
