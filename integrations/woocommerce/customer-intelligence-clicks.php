<?php
/**
 * Plugin Name: Customer Intelligence Click Attribution
 * Description: Stores a tracked ci_click_id on WooCommerce paid orders. No automatic installation or site edits.
 * Version: 1.0.0
 */
if (!defined('ABSPATH')) exit;
function ci_valid_click_id($value) { return is_string($value) && preg_match('/^[a-f0-9-]{36}$/i', $value); }
add_action('wp_loaded', function () {
    if (!function_exists('WC') || !WC()->session || empty($_GET['ci_click_id'])) return;
    $id = sanitize_text_field(wp_unslash($_GET['ci_click_id']));
    if (ci_valid_click_id($id)) WC()->session->set('ci_click_id', $id);
});
add_action('woocommerce_checkout_create_order', function ($order) {
    $id = WC()->session ? WC()->session->get('ci_click_id') : null;
    if (ci_valid_click_id($id)) $order->update_meta_data('_ci_click_id', $id);
});
add_action('woocommerce_store_api_checkout_update_order_from_request', function ($order) {
    $id = WC()->session ? WC()->session->get('ci_click_id') : null;
    if (ci_valid_click_id($id)) $order->update_meta_data('_ci_click_id', $id);
}, 10, 1);
