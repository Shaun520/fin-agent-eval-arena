/*
 * 汇总报告生成脚本（保证「程序生成」可复现）
 *
 *   npm run report                    # 优先读 report-input.json；缺失时回退内置演示数据
 *   npm run report -- in.json         # 读指定导出 JSON
 *   npm run report -- in.json out.md  # 指定输入与输出
 *
 * 输出：report.md（与「汇总报告」页共用 buildReportData / reportMarkdown，口径一致）
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildReportData, reportMarkdown } from '../src/lib/export.js'
import { MODELS } from '../src/data/models.js'

const root = process.cwd()
const readJSON = (p) => JSON.parse(readFileSync(resolve(root, p), 'utf8'))

const [inArg, outArg] = process.argv.slice(2)

let raw
let source
if (inArg) {
  raw = readJSON(inArg)
  source = inArg
} else if (existsSync(resolve(root, 'report-input.json'))) {
  raw = readJSON('report-input.json')
  source = 'report-input.json'
} else {
  /* 回退：无导出文件时用内置演示数据复现（cases + answers + 20 条演示评审） */
  raw = {
    models: MODELS,
    cases: readJSON('src/data/cases.json'),
    answers: readJSON('src/data/answers.json'),
    reviews: readJSON('src/data/demoReviews.json'),
  }
  source = '内置演示数据（src/data/cases.json + answers.json + demoReviews.json）'
}

const models = Array.isArray(raw.models) && raw.models.length ? raw.models : MODELS
const data = buildReportData({
  cases: raw.cases || [],
  answers: raw.answers || [],
  reviews: raw.reviews || [],
  models,
})
const md = reportMarkdown({ generatedAt: new Date().toLocaleString('zh-CN'), models, ...data })

const outPath = resolve(root, outArg || 'report.md')
writeFileSync(outPath, md, 'utf8')

console.log('数据来源：' + source)
console.log(
  '覆盖率：问题数 ' + data.askedCount + ' / 回答数 ' + data.totalAns + ' / 已完成 ' + data.doneCount + '（' + data.rate + '%）',
)
console.log('已生成：' + outPath + '（' + md.length + ' 字符）')