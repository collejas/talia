<?php
/**
 *  Functions and definitions for Auxin framework
 *
 * @package    Auxin
 * @author     averta (c) 2014-2024
 * @link       http://averta.net
 */

/*-----------------------------------------------------------------------------------*/
/*  Add your custom functions here -  We recommend you to use "code-snippets" plugin instead
/*  https://wordpress.org/plugins/code-snippets/
/*-----------------------------------------------------------------------------------*/

add_action(
    'wp_footer',
    function () {
        $theme_uri = get_stylesheet_directory_uri();
        ?>
        <script type="module">
            const TENANT_ALIAS = "imlux";
            const TRACKING_API_BASE = "https://talia.mx/api/crm";

            const loadTracking = async () => {
                const trackingModule = await import("<?php echo esc_js( $theme_uri . '/js/visit-tracking.js' ); ?>");

                trackingModule.initialiseVisitTracking({
                    tenantAlias: TENANT_ALIAS,
                    apiBaseUrl: TRACKING_API_BASE,
                });
            };

            loadTracking().catch((error) => {
                console.error("No se pudo cargar el tracking web:", error);
            });
        </script>
        <?php
    },
    20
);

/*-----------------------------------------------------------------------------------*/
/*  Init theme framework
/*-----------------------------------------------------------------------------------*/
require( 'auxin/auxin-include/auxin.php' );
/*-----------------------------------------------------------------------------------*/
