const Lang = imports.lang;
const Gio = imports.gi.Gio;
const ExtensionUtils = imports.misc.extensionUtils;
const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;

const Me = ExtensionUtils.getCurrentExtension();
const GPasteClient = Me.imports.gpaste_client;

const ICONS = {
    preferences: 'preferences-system-symbolic',
    toggle: 'emblem-synchronizing-symbolic',
    clear: 'edit-clear-all-symbolic',
    delete: 'edit-delete-symbolic',
    indicator: 'edit-paste-symbolic',
    switch_history: 'view-list-symbolic'
};

const SPINNER_ICON = global.datadir + '/theme/process-working.svg';
const SPINNER_ICON_SIZE = 24;

const SETTINGS = getSettings();

function launch_extension_prefs(uuid) {
    const Shell = imports.gi.Shell;
    let appSys = Shell.AppSystem.get_default();
    let app = appSys.lookup_app('gnome-shell-extension-prefs.desktop');
    let info = app.get_app_info();
    let timestamp = global.display.get_current_time_roundtrip();
    info.launch_uris(
        ['extension:///' + uuid],
        global.create_app_launch_context(timestamp, -1)
    );
}

function is_blank(str) {
    return (!str || /^\s*$/.test(str));
}

function starts_with(str1, str2) {
    return str1.slice(0, str2.length) == str2;
}

function ends_with(str1, str2) {
  return str1.slice(-str2.length) == str2;
}

function escape_html(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

function get_unichar(keyval) {
    let ch = Clutter.keysym_to_unicode(keyval);

    if(ch) {
        return String.fromCharCode(ch);
    }
    else {
        return false;
    }
}

function is_pointer_inside_actor(actor, x, y) {
    let result = false;
    let [actor_x, actor_y] = actor.get_transformed_position();
    let [pointer_x, pointer_y] = global.get_pointer();

    if(x) pointer_x = x;
    if(y) pointer_y = y;

    if(
        pointer_x >= actor_x
        && pointer_x <= (actor_x + actor.width)
        && pointer_y >= actor_y
        && pointer_y <= (actor_y + actor.height)
    ) {
        result = true;
    }

    return result;
}

function get_info_for_item(item_id, callback) {
    function on_query_complete(object, res, uri) {
        let info;

        try {
            info = object.query_info_finish(res);
        }
        catch(e) {
            log('get_info_for_item(): %s'.format(e));

            if(e.code === 1) callback('No such file or directory', null);
            else callback(e.message, null);

            return;
        }

        let content_type = info.get_content_type();
        let thumbnail_path = info.get_attribute_byte_string('thumbnail::path');
        let result ='Type: %s'.format(content_type);

        if(content_type !== 'inode/directory') {
            let size = info.get_size();
            result = '%s, '.format(GLib.format_size(size)) + result;
            uri = null
        }

        if(starts_with(content_type, 'image') || thumbnail_path) {
            if(thumbnail_path) {
                uri = 'file://%s'.format(thumbnail_path);
            }
        }

        callback(result, uri);
    }

    GPasteClient.get_client().get_element(item_id, Lang.bind(this, function(item) {
        if(!item) {
            callback(false, null);
            return;
        }

        if(starts_with(item, '[Files]') || starts_with(item, '[Image')) {
            GPasteClient.get_client().get_raw_element(item_id,
                Lang.bind(this, function(result) {
                    if(!result) return;

                    let uris = result.split('\n');

                    if(uris.length > 1) {
                        callback('%s items'.format(uris.length), null);
                        return;
                    }

                    let uri = 'file://%s'.format(uris[0]);
                    let file = Gio.file_new_for_uri(uri);
                    file.query_info_async(
                        'standard::content-type,standard::size,thumbnail::path',
                        Gio.FileQueryInfoFlags.NONE,
                        GLib.PRIORITY_DEFAULT,
                        null,
                        Lang.bind(this, on_query_complete, uri)
                    );
                })
            );
        }
        else {
            let info = '%s symbol(s), %s line(s)'.format(
                item.length,
                item.split('\n').length
            );
            callback(info, null);
        }
    }));
}

/**
 * getSettings:
 * @schema: (optional): the GSettings schema id
 *
 * Builds and return a GSettings schema for @schema, using schema files
 * in extensionsdir/schemas. If @schema is not provided, it is taken from
 * metadata['settings-schema'].
 */
function getSettings(schema) {
    let extension = ExtensionUtils.getCurrentExtension();

    schema = schema || extension.metadata['settings-schema'];

    const GioSSS = Gio.SettingsSchemaSource;

    // check if this extension was built with "make zip-file", and thus
    // has the schema files in a subfolder
    // otherwise assume that extension has been installed in the
    // same prefix as gnome-shell (and therefore schemas are available
    // in the standard folders)
    let schemaDir = extension.dir.get_child('schemas');
    let schemaSource;

    if(schemaDir.query_exists(null)) {
        schemaSource = GioSSS.new_from_directory(
            schemaDir.get_path(),
            GioSSS.get_default(),
            false
        );
    }
    else {
        schemaSource = GioSSS.get_default();
    }

    let schemaObj = schemaSource.lookup(schema, true);

    if(!schemaObj)
        throw new Error(
            'Schema '+schema+' could not be found for extension '
            +extension.metadata.uuid+'. Please check your installation.'
        );

    return new Gio.Settings({ settings_schema: schemaObj });
}
