const St = imports.gi.St;
const Lang = imports.lang;

const GPasteMergePanel = new Lang.Class({
    Name: 'GPasteMergePanel',

    _init: function() {
        this.actor = new St.BoxLayout({
            vertical: false,
            visible: false
        });

        this._merge_button = new St.Button({
            label: '  Merge  ',
            style_class: 'gpaste-button'
        });

        let decorator_label = new St.Label({
            text: 'decorator  '
        });
        this._decorator_entry = new St.Entry({
            width: 50,
            style: 'font-size: 12px'
        });
        let separator_label = new St.Label({
            text: '  separator  '
        });
        this._separator_entry = new St.Entry({
            width: 50,
            style: 'font-size: 12px;'
        });
        this.merge_box = new St.BoxLayout({
            vertical: false,
            style: 'padding-top: 10px;'
        });
        this.merge_box.add_child(decorator_label);
        this.merge_box.add_child(this._decorator_entry);
        this.merge_box.add_child(separator_label);
        this.merge_box.add_child(this._separator_entry);
        this.merge_box.add_child(this._merge_button);

        this._merge_count_label = new St.Label();

        let reset_icon = new St.Icon({
            icon_name: 'edit-delete-symbolic',
            icon_size: 20
        });
        this.reset_button = new St.Button({
            child: reset_icon,
            style_class: 'gpaste-button'
        });

        let delete_icon = new St.Icon({
            icon_name: 'user-trash-symbolic',
            icon_size: 20
        });
        this.delete_button = new St.Button({
            child: delete_icon,
            style_class: 'gpaste-button'
        });

        this.actor.add(this._merge_count_label, {
            x_expand: false,
            x_fill: false,
            x_align: St.Align.START,
            y_expand: false,
            y_fill: false,
            y_align: St.Align.MIDDLE
        });
        this.actor.add(this.reset_button, {
            x_expand: false,
            x_fill: false,
            x_align: St.Align.START,
            y_expand: false,
            y_fill: false,
            y_align: St.Align.MIDDLE
        });
        this.actor.add(this.delete_button, {
            x_expand: false,
            x_fill: false,
            x_align: St.Align.START,
            y_expand: false,
            y_fill: false,
            y_align: St.Align.MIDDLE
        });
        this.actor.add(this.merge_box, {
            expand: true,
            x_fill: false,
            x_align: St.Align.END,
            y_fill: false,
            y_align: St.Align.MIDDLE
        });
    },

    set_label: function(text) {
        this._merge_count_label.set_text(text);
    },

    show: function() {
        this.actor.show();
    },

    hide: function() {
        this.actor.hide();
    },

    get decorator_entry() {
        return this._decorator_entry;
    },

    get separator_entry() {
        return this._separator_entry;
    },

    get decorator() {
        return this._decorator_entry.get_text();
    },

    get separator() {
        return this._separator_entry.get_text();
    },

    get button() {
        return this._merge_button;
    }
});
