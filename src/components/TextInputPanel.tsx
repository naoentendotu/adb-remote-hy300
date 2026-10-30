import { useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Button, Chip, Text, View } from 'react-native-ui-lib';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import ChevronUp from 'lucide-react-native/icons/chevron-up';

import { Field } from '@/components/Field';
import type { IconName } from '@/components/RemoteButton';
import { uiIcon } from '@/components/uiIcon';
import { useAdbConnection } from '@/hooks/useAdbConnection';
import { stripAccents } from '@/services/adb/AdbCommands';
import { describeError, toAdbError } from '@/services/adb/AdbErrors';
import { pushHistory } from '@/services/storage/SettingsStorage';
import { radius, useThemed, type Colors } from '@/theme';
import type { RemoteKey } from '@/types/adb';

/** Keeps only what Android 9's `input text` can type: accents are dropped, anything else non-ASCII removed. */
const typeable = (s: string) => stripAccents(s).replace(/[^\x20-\x7e]/g, '');

/**
 * Live typing: the field mirrors the projector's text box. Each change is diffed against what was
 * already sent; extra characters go out with `input text`, removed ones as DEL presses. Every
 * `input text` costs ~1 s on the HY300, so keystrokes made meanwhile are batched into the next send.
 * shortcut: assumes the projector's cursor is at the end (edits mid-text are sent as delete + retype).
 */
export function TextInputPanel({ enabled }: { enabled: boolean }) {
  const { colors, styles } = useThemed(makeStyles);
  const { client, settings, updateSettings } = useAdbConnection();
  const [text, setText] = useState('');
  const [status, setStatus] = useState<{ error: boolean; text: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const target = useRef('');
  const sent = useRef('');
  const pumping = useRef(false);

  const pump = async () => {
    if (pumping.current) return;
    pumping.current = true;
    setSyncing(true);
    try {
      while (sent.current !== target.current) {
        const want = target.current;
        let p = 0;
        while (p < sent.current.length && p < want.length && sent.current[p] === want[p]) p++;
        for (let i = sent.current.length; i > p; i--) {
          await client.pressKey('del');
          sent.current = sent.current.slice(0, -1);
        }
        const extra = want.slice(p);
        if (extra) {
          await client.sendText(extra, 'whole', settings.model === 'hy300');
          sent.current = want;
        }
      }
      setStatus(null);
    } catch (e) {
      setStatus({ error: true, text: describeError(toAdbError(e)) });
      // Unknown state on the projector: stop mirroring until the user starts a new text.
      target.current = sent.current;
      setText(sent.current);
    } finally {
      pumping.current = false;
      setSyncing(false);
    }
  };

  const onChange = (value: string) => {
    const clean = typeable(value);
    setText(clean);
    if (!enabled) return;
    target.current = clean;
    void pump();
  };

  /** Forget what was typed locally without deleting it on the projector (e.g. after moving to another field). */
  const reset = () => {
    target.current = sent.current = '';
    setText('');
    setStatus(null);
  };

  /**
   * The phone's own ⌫ already deletes on the projector through the mirror. On an empty field it changes nothing,
   * so it is forwarded as a DEL: text that was on the projector before can still be erased from the phone keyboard.
   */
  const onKeyPress = ({ nativeEvent }: { nativeEvent: { key: string } }) => {
    if (nativeEvent.key !== 'Backspace' || text || !enabled) return;
    client.pressKey('del').catch((e) => setStatus({ error: true, text: describeError(toAdbError(e)) }));
  };

  /** Arrow/OK shortcuts to pick a search result without leaving the keyboard tab. */
  const nav = (key: RemoteKey) => () =>
    void client.pressKey(key).catch((e) => setStatus({ error: true, text: describeError(toAdbError(e)) }));

  const enter = async () => {
    if (text && settings.keepHistory) updateSettings({ history: pushHistory(settings.history, text) });
    try {
      await client.pressKey('enter');
      setStatus({ error: false, text: 'Enter enviado.' });
    } catch (e) {
      setStatus({ error: true, text: describeError(toAdbError(e)) });
    }
  };

  const navKey = (key: RemoteKey, icon: IconName, label: string) => (
    <Button
      key={key}
      round
      style={styles.navButton}
      backgroundColor={colors.surfaceHigh}
      iconSource={uiIcon(icon, colors.icon, 22)}
      accessibilityLabel={label}
      disabled={!enabled}
      onPress={nav(key)}
    />
  );

  return (
    <View gap-s3>
      <Text style={styles.hint}>Selecione o campo de busca no projetor e digite: o texto vai sendo enviado. O ⌫ do celular apaga no projetor. Acentos são removidos.</Text>
      <Field
        autoFocus
        value={text}
        onChangeText={onChange}
        onKeyPress={onKeyPress}
        editable={enabled}
        placeholder="Digite aqui"
        autoCorrect={false}
        autoCapitalize="none"
        submitBehavior="submit"
        returnKeyType="search"
        onSubmitEditing={enter}
        accessibilityLabel="Texto enviado ao projetor enquanto você digita"
      />
      <Text style={[styles.feedback, status?.error && { color: colors.danger }]}>
        {syncing ? 'Enviando…' : (status?.text ?? (text ? 'Sincronizado com o projetor.' : ' '))}
      </Text>
      <View row gap-s2>
        <View flex>
          <Button label="Enter" size={Button.sizes.large} borderRadius={radius.full} backgroundColor={colors.primary} color={colors.onPrimary} disabled={!enabled} onPress={enter} />
        </View>
        <Button label="Limpar" size={Button.sizes.large} borderRadius={radius.full} outline outlineColor={colors.outline} color={colors.icon} onPress={reset} />
      </View>
      <View row spread centerV style={styles.navRow}>
        {navKey('left', ChevronLeft, 'Esquerda')}
        {navKey('up', ChevronUp, 'Cima')}
        <Button
          round
          style={styles.navButton}
          backgroundColor={colors.primary}
          label="OK"
          labelStyle={styles.okLabel}
          color={colors.onPrimary}
          accessibilityLabel="OK"
          disabled={!enabled}
          onPress={nav('center')}
        />
        {navKey('down', ChevronDown, 'Baixo')}
        {navKey('right', ChevronRight, 'Direita')}
      </View>
      {settings.keepHistory && settings.history.length > 0 && (
        <View gap-s2 marginT-s1>
          <View row spread centerV>
            <Text style={styles.section}>Recentes</Text>
            <Button link label="Apagar histórico" linkColor={colors.primary} labelStyle={styles.link} onPress={() => updateSettings({ history: [] })} />
          </View>
          <View row style={styles.chips}>
            {settings.history.map((h) => (
              <Chip
                key={h}
                label={h}
                labelStyle={styles.chipText}
                containerStyle={styles.chip}
                accessibilityLabel={`Digitar "${h}"`}
                onPress={enabled ? () => onChange(h) : undefined}
              />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    hint: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
    feedback: { color: colors.textMuted, fontSize: 13 },
    navRow: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.outline, padding: 8 },
    navButton: { width: 48, height: 48 },
    okLabel: { fontSize: 15, fontWeight: '700' },
    section: { color: colors.text, fontSize: 16, fontWeight: '600' },
    link: { fontSize: 13 },
    chips: { flexWrap: 'wrap', gap: 8 },
    chip: { borderColor: colors.outline, maxWidth: 200 },
    chipText: { color: colors.text, fontSize: 13 },
  });
